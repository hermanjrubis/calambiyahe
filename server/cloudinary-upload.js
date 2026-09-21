/**
 * Cloudinary upload helper.
 *
 * Uploads are SIGNED and happen here on the server: the browser posts the file to an
 * authenticated Express route, the route hands the buffer to uploadBuffer() below, and
 * only CLOUDINARY_API_SECRET-signed requests ever reach Cloudinary. The secret is never
 * sent to the client and there is no unsigned upload preset to leak.
 *
 * Why this exists: the upload routes used to write files to the server's own disk and
 * store a relative "/uploads/..." path in Firestore. That works on a laptop and breaks
 * everywhere else - Vercel's filesystem is read-only and ephemeral, and public/uploads
 * is gitignored, so those paths 404 in production and every image renders broken.
 * Storing the Cloudinary secure_url instead gives Firestore an absolute https URL that
 * any deployment can serve.
 */

const { v2: cloudinary } = require('cloudinary');

let configured = false;

/**
 * Returns true when all three Cloudinary variables are present, so callers can fail with
 * a clear message instead of a confusing Cloudinary error.
 */
function isConfigured() {
    return Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );
}

function configure() {
    if (configured) return;
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        // Trim any stray wrapping characters: the secret is routinely pasted out of the
        // Cloudinary dashboard with brackets or quotes around it, which yields a
        // confusing "api_secret mismatch" rather than an obviously malformed value.
        api_secret: String(process.env.CLOUDINARY_API_SECRET || '')
            .trim()
            .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''),
        secure: true
    });
    configured = true;
}

/**
 * Uploads one image buffer and resolves to its https secure_url.
 *
 * @param {Buffer} buffer    the validated image bytes
 * @param {string} folder    Cloudinary folder, e.g. "calzada/posts/<postId>"
 * @param {string} publicId  filename within that folder (no extension)
 * @returns {Promise<{url: string, publicId: string}>}
 */
function uploadBuffer(buffer, folder, publicId) {
    configure();
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                public_id: publicId,
                resource_type: 'image',
                overwrite: true,
                // Let Cloudinary pick the best format and a sane quality for the browser
                // asking for it; the originals are often multi-megabyte phone photos.
                transformation: [{ quality: 'auto', fetch_format: 'auto' }]
            },
            (err, result) => {
                if (err) return reject(err);
                if (!result || !result.secure_url) return reject(new Error('Cloudinary returned no secure_url'));
                resolve({ url: result.secure_url, publicId: result.public_id });
            }
        );
        stream.end(buffer);
    });
}

/**
 * Best-effort delete. Used when a business replaces its avatar or a post is removed.
 * Never throws: losing track of one orphaned asset must not fail the user's request.
 */
async function destroyByUrl(secureUrl) {
    if (!isConfigured() || typeof secureUrl !== 'string') return false;
    const publicId = publicIdFromUrl(secureUrl);
    if (!publicId) return false;
    try {
        configure();
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
        return true;
    } catch (err) {
        console.warn('Cloudinary delete failed (ignored):', err.message);
        return false;
    }
}

/**
 * Recovers the public_id from a delivery URL, i.e. everything after the /upload/<version>/
 * segment and before the extension. Returns null for anything that isn't ours.
 */
function publicIdFromUrl(secureUrl) {
    if (typeof secureUrl !== 'string') return null;
    const match = secureUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
    return match ? match[1] : null;
}

module.exports = { uploadBuffer, destroyByUrl, publicIdFromUrl, isConfigured };
