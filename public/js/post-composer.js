/**
 * Calzada Shared Post Composer Module
 * Used by discover.html and my-business.html
 */

export function countBusinessPostsThisMonth(posts) {
    if (!Array.isArray(posts)) return 0;
    const now = new Date();
    const manilaFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'numeric'
    });
    const [curMonth, curYear] = manilaFmt.format(now).split('/').map(Number);

    return posts.filter(p => {
        if (!p.createdAt) return false;
        const d = p.createdAt.toDate ? p.createdAt.toDate() : (p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt));
        const [pMonth, pYear] = manilaFmt.format(d).split('/').map(Number);
        return pMonth === curMonth && pYear === curYear;
    }).length;
}

export function getPostLimitForPlan(planId) {
    const planCfg = window.CALZADA_PLANS?.[planId];
    if (planCfg && planCfg.postsPerMonth !== undefined) {
        return planCfg.postsPerMonth;
    }
    return 4; // Listed default limit
}

/**
 * Shrink a photo before upload. Phone photos are often 3-8MB; the API (Vercel) rejects request
 * bodies over ~4.5MB with a plain-text error, which Safari reports as
 * "The string did not match the expected pattern". Long side 1600px, JPEG, about 0.8MB max.
 */
export async function compressImageFile(file, { maxSide = 1600, quality = 0.82, maxBytes = 850 * 1024 } = {}) {
    if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type || '')) return file;
    if (file.size <= 400 * 1024) return file;

    let source = null;
    let objectUrl = null;
    try {
        if (typeof createImageBitmap === 'function') {
            source = await createImageBitmap(file, { imageOrientation: 'from-image' });
        }
    } catch (_) {
        source = null;
    }
    if (!source) {
        objectUrl = URL.createObjectURL(file);
        source = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Could not read this photo. Try a JPG or PNG.'));
            img.src = objectUrl;
        });
    }

    try {
        const w = source.width || source.naturalWidth;
        const h = source.height || source.naturalHeight;
        if (!w || !h) return file;
        const scale = Math.min(1, maxSide / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF'; // PNG transparency becomes white instead of black
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

        const toBlob = (q) => new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', q));
        let q = quality;
        let blob = await toBlob(q);
        while (blob && blob.size > maxBytes && q > 0.5) {
            q -= 0.08;
            blob = await toBlob(q);
        }
        if (!blob || blob.size >= file.size) return file;
        const baseName = (file.name || 'photo').replace(/\.[^.]+$/, '');
        return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
    } finally {
        if (source && typeof source.close === 'function') source.close();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
}

/**
 * Read an API response as JSON without crashing on plain-text errors (e.g. "Request Entity Too Large").
 */
export async function readApiJson(res) {
    const text = await res.text();
    try {
        return text ? JSON.parse(text) : {};
    } catch (_) {
        if (res.status === 413) return { error: 'The photos are too large to upload. Try fewer or smaller photos.' };
        return { error: res.ok ? 'Unexpected reply from the server. Please try again.' : `Upload failed (error ${res.status}). Please try again.` };
    }
}

export async function uploadPostPhotos(postId, businessId, files, token) {
    const ready = [];
    for (const f of files) ready.push(await compressImageFile(f));

    const formData = new FormData();
    formData.append('postId', postId);
    formData.append('businessId', businessId);
    ready.forEach(f => {
        formData.append('photos', f);
    });

    const res = await fetch('/api/posts/upload-photo', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: formData
    });

    const data = await readApiJson(res);
    if (!res.ok) {
        throw new Error(data.error || 'Failed to upload photos.');
    }
    if (!Array.isArray(data.photoUrls) || data.photoUrls.length === 0) {
        throw new Error('The photos did not upload. Please try again.');
    }
    return data.photoUrls;
}

/**
 * Open Post Composer Sheet / Modal
 * Phone: bottom sheet that slides up (drag the handle down to close).
 * Desktop: centered dialog.
 * onClose fires every time the composer goes away (X, backdrop, Esc, swipe, or after posting).
 */
export function openPostComposer({
    business,
    currentUser,
    existingPosts = [],
    getFirebaseIdToken,
    db,
    setDoc,
    doc,
    collection,
    serverTimestamp,
    Timestamp,
    onSuccess,
    onError,
    onClose
}) {
    // Remove any existing composer modal
    const existingModal = document.getElementById('calzadaComposerModal');
    if (existingModal) existingModal.remove();

    const plan = business.plan || 'listed';
    const planName = window.CALZADA_PLANS?.[plan]?.name || 'Listed';
    const limit = getPostLimitForPlan(plan);
    const thisMonthCount = countBusinessPostsThisMonth(existingPosts);
    const remainingPosts = limit === null ? null : Math.max(0, limit - thisMonthCount);
    const limitReached = limit !== null && remainingPosts <= 0;
    const limitText = limit === null
        ? 'Unlimited posts this month.'
        : `${remainingPosts} of ${limit} posts left this month.`;

    const todayManila = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'calzadaComposerModal';
    modalOverlay.className = 'composer-overlay';

    const formHtml = `
            <form id="composerForm" class="composer-form" novalidate>
                <div class="composer-segmented" role="radiogroup" aria-label="Post type">
                    <span class="segmented-thumb" aria-hidden="true"></span>
                    <label class="segmented-item active">
                        <input type="radio" name="postLabel" value="announcement" checked>
                        <span>Announcement</span>
                    </label>
                    <label class="segmented-item">
                        <input type="radio" name="postLabel" value="promo">
                        <span>Promo</span>
                    </label>
                    <label class="segmented-item">
                        <input type="radio" name="postLabel" value="new_item">
                        <span>New item</span>
                    </label>
                </div>

                <div id="promoUntilContainer" class="promo-date-wrap" hidden>
                    <label for="promoUntilInput" class="promo-date-label">Promo ends</label>
                    <input type="date" id="promoUntilInput" class="promo-date-input" min="${todayManila}">
                </div>

                <div class="composer-photo-grid" id="composerPhotoGrid">
                    <button type="button" class="composer-add-tile" id="composerAddTile">
                        <i class="ti ti-photo-plus" aria-hidden="true"></i>
                        <span class="composer-add-title">Add photos</span>
                        <span class="composer-add-sub">Up to 5 · JPG, PNG or WebP</span>
                    </button>
                </div>
                <input type="file" id="composerFileInput" accept="image/jpeg,image/png,image/webp" multiple hidden>

                <textarea id="composerCaption" class="composer-textarea" rows="3" maxlength="500" placeholder="What's new at your place?"></textarea>
                <div class="composer-caption-count" id="composerCaptionCount">0 / 500</div>

                <p class="composer-error" id="composerError" role="alert" hidden></p>

                <div class="composer-footer">
                    <button type="button" class="composer-cancel-btn" id="btnComposerCancel">Cancel</button>
                    <button type="submit" class="composer-submit-btn" id="btnComposerSubmit" disabled>
                        <span class="composer-submit-label">Post</span>
                    </button>
                </div>
            </form>`;

    const limitHtml = `
            <div class="composer-limit-note">
                <p>You've used all ${limit} posts for this month on the ${escapeHtml(planName)} plan. New posts open again on the 1st.</p>
                <div class="composer-footer">
                    <a href="/plans" class="composer-cancel-btn">See plans</a>
                    <button type="button" class="composer-submit-btn" id="btnComposerCancel">Okay</button>
                </div>
            </div>`;

    modalOverlay.innerHTML = `
        <div class="composer-container" role="dialog" aria-modal="true" aria-labelledby="composerTitle">
            <div class="composer-handle" aria-hidden="true"><span></span></div>
            <div class="composer-header">
                <div>
                    <h2 id="composerTitle" class="composer-title">New post</h2>
                    <div class="composer-sub">Posting as <strong>${escapeHtml(business.name || 'Your business')}</strong> · ${limitText}</div>
                </div>
                <button type="button" class="composer-close-btn" id="btnComposerClose" aria-label="Close composer">
                    <i class="ti ti-x"></i>
                </button>
            </div>
            ${limitReached ? limitHtml : formHtml}
        </div>
    `;

    document.body.appendChild(modalOverlay);
    const sheet = modalOverlay.querySelector('.composer-container');
    const lastFocused = document.activeElement;
    requestAnimationFrame(() => modalOverlay.classList.add('is-open'));

    // Selected files state
    let selectedFiles = []; // { file, previewUrl }
    let isClosing = false;
    let isSubmitting = false;

    const closeModal = () => {
        if (isClosing) return;
        isClosing = true;
        document.removeEventListener('keydown', onKeydown);
        selectedFiles.forEach(item => {
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        });
        modalOverlay.classList.remove('is-open');
        modalOverlay.classList.add('is-closing');
        sheet.style.transform = '';
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setTimeout(() => {
            modalOverlay.remove();
            if (lastFocused && typeof lastFocused.focus === 'function') {
                try { lastFocused.focus({ preventScroll: true }); } catch (_) {}
            }
            if (onClose) onClose();
        }, reduce ? 0 : 240);
    };

    const onKeydown = (e) => {
        if (e.key === 'Escape' && !isSubmitting) closeModal();
    };
    document.addEventListener('keydown', onKeydown);

    modalOverlay.querySelector('#btnComposerClose').addEventListener('click', () => { if (!isSubmitting) closeModal(); });
    modalOverlay.querySelector('#btnComposerCancel')?.addEventListener('click', () => { if (!isSubmitting) closeModal(); });
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay && !isSubmitting) closeModal();
    });

    // Drag the handle (or header) down to close on phones
    const dragZone = modalOverlay.querySelector('.composer-handle');
    let dragStartY = null;
    let dragDelta = 0;
    const onDragMove = (e) => {
        if (dragStartY === null) return;
        dragDelta = Math.max(0, e.touches[0].clientY - dragStartY);
        sheet.style.transform = `translateY(${dragDelta}px)`;
    };
    const onDragEnd = () => {
        if (dragStartY === null) return;
        sheet.style.transition = '';
        if (dragDelta > 110 && !isSubmitting) {
            closeModal();
        } else {
            sheet.style.transform = '';
        }
        dragStartY = null;
        dragDelta = 0;
    };
    dragZone?.addEventListener('touchstart', (e) => {
        dragStartY = e.touches[0].clientY;
        sheet.style.transition = 'none';
    }, { passive: true });
    dragZone?.addEventListener('touchmove', onDragMove, { passive: true });
    dragZone?.addEventListener('touchend', onDragEnd);
    dragZone?.addEventListener('touchcancel', onDragEnd);

    if (limitReached) {
        setTimeout(() => modalOverlay.querySelector('#btnComposerCancel')?.focus({ preventScroll: true }), 50);
        return;
    }

    const fileInput = modalOverlay.querySelector('#composerFileInput');
    const photoGrid = modalOverlay.querySelector('#composerPhotoGrid');
    const addTile = modalOverlay.querySelector('#composerAddTile');
    const submitBtn = modalOverlay.querySelector('#btnComposerSubmit');
    const submitLabel = submitBtn.querySelector('.composer-submit-label');
    const captionInput = modalOverlay.querySelector('#composerCaption');
    const captionCount = modalOverlay.querySelector('#composerCaptionCount');
    const promoContainer = modalOverlay.querySelector('#promoUntilContainer');
    const promoInput = modalOverlay.querySelector('#promoUntilInput');
    const form = modalOverlay.querySelector('#composerForm');
    const errorEl = modalOverlay.querySelector('#composerError');
    const segmented = modalOverlay.querySelector('.composer-segmented');
    const segThumb = modalOverlay.querySelector('.segmented-thumb');

    const showError = (msg) => {
        errorEl.textContent = msg;
        errorEl.hidden = !msg;
    };

    // Segmented control with a sliding highlight
    const moveSegThumb = () => {
        const active = segmented.querySelector('.segmented-item.active');
        if (!active || !segThumb) return;
        segThumb.style.width = `${active.offsetWidth}px`;
        segThumb.style.transform = `translateX(${active.offsetLeft}px)`;
    };
    modalOverlay.querySelectorAll('input[name="postLabel"]').forEach(radio => {
        radio.addEventListener('change', () => {
            modalOverlay.querySelectorAll('.segmented-item').forEach(item => item.classList.remove('active'));
            radio.closest('.segmented-item')?.classList.add('active');
            moveSegThumb();
            promoContainer.hidden = radio.value !== 'promo';
            if (radio.value !== 'promo') promoInput.value = '';
            updateSubmitState();
        });
    });
    requestAnimationFrame(moveSegThumb);
    window.addEventListener('resize', moveSegThumb);

    captionInput.addEventListener('input', () => {
        captionCount.textContent = `${captionInput.value.length} / 500`;
    });

    function updateSubmitState() {
        submitBtn.disabled = selectedFiles.length === 0 || isSubmitting;
    }

    addTile.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        fileInput.value = '';
        if (files.length === 0) return;

        const tooBig = files.filter(f => f.size > 25 * 1024 * 1024);
        const valid = files.filter(f => f.size <= 25 * 1024 * 1024);
        const availableSlots = 5 - selectedFiles.length;
        const toAdd = valid.slice(0, availableSlots);

        toAdd.forEach(file => {
            selectedFiles.push({ file, previewUrl: URL.createObjectURL(file) });
        });

        if (tooBig.length) showError(`${tooBig.length === 1 ? 'One photo is' : `${tooBig.length} photos are`} over 25MB and ${tooBig.length === 1 ? 'was' : 'were'} skipped.`);
        else if (valid.length > availableSlots) showError('Only 5 photos per post. The extra photos were skipped.');
        else showError('');

        renderThumbs();
    });

    function renderThumbs() {
        photoGrid.querySelectorAll('.composer-thumb-item').forEach(el => el.remove());
        selectedFiles.forEach((item, idx) => {
            const tile = document.createElement('div');
            tile.className = 'composer-thumb-item';
            tile.innerHTML = `
                <img src="${item.previewUrl}" alt="Photo ${idx + 1}" class="composer-thumb-img">
                ${idx === 0 ? '<span class="composer-thumb-cover">Cover</span>' : ''}
                <button type="button" class="composer-thumb-remove" aria-label="Remove photo ${idx + 1}">
                    <i class="ti ti-x"></i>
                </button>`;
            tile.querySelector('.composer-thumb-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                const removed = selectedFiles.splice(idx, 1)[0];
                if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
                renderThumbs();
            });
            photoGrid.insertBefore(tile, addTile);
        });
        photoGrid.classList.toggle('has-photos', selectedFiles.length > 0);
        addTile.hidden = selectedFiles.length >= 5;
        addTile.querySelector('.composer-add-title').textContent = selectedFiles.length ? 'Add more' : 'Add photos';
        updateSubmitState();
    }

    // Submit Handler
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (selectedFiles.length === 0 || isSubmitting) return;

        const selectedLabel = form.querySelector('input[name="postLabel"]:checked')?.value || 'announcement';
        if (selectedLabel === 'promo' && !promoInput.value) {
            showError('Pick the date your promo ends.');
            promoInput.focus();
            return;
        }

        isSubmitting = true;
        showError('');
        updateSubmitState();
        submitBtn.classList.add('is-loading');
        submitLabel.textContent = 'Posting…';

        try {
            const token = await getFirebaseIdToken();
            const newPostRef = doc(collection(db, 'posts'));
            const newPostId = newPostRef.id;

            const filesToUpload = selectedFiles.map(item => item.file);
            const photoUrls = await uploadPostPhotos(newPostId, business.id, filesToUpload, token);

            let promoUntilTimestamp = null;
            if (selectedLabel === 'promo' && promoInput.value) {
                // End of the chosen day, Philippine time
                promoUntilTimestamp = Timestamp.fromDate(new Date(`${promoInput.value}T23:59:59+08:00`));
            }

            const postDocData = {
                businessId: business.id,
                businessName: business.name || '',
                businessCategory: business.category || '',
                ownerId: currentUser.uid,
                photoUrls: photoUrls,
                caption: captionInput.value.trim() || null,
                likeCount: 0,
                createdAt: serverTimestamp(),
                updatedAt: null,
                status: 'active',
                label: selectedLabel,
                promoUntil: promoUntilTimestamp
            };

            await setDoc(newPostRef, postDocData);

            isSubmitting = false;
            closeModal();

            if (onSuccess) {
                onSuccess({
                    id: newPostId,
                    ...postDocData,
                    createdAt: new Date(),
                    isLiked: false
                });
            }

        } catch (err) {
            console.error('Error creating post in composer:', err);
            isSubmitting = false;
            submitBtn.classList.remove('is-loading');
            submitLabel.textContent = 'Post';
            updateSubmitState();
            showError(err.message || 'Could not post. Please try again.');
            if (onError) onError(err);
        }
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
