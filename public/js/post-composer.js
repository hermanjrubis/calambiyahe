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

export async function uploadPostPhotos(postId, businessId, files, token) {
    const formData = new FormData();
    formData.append('postId', postId);
    formData.append('businessId', businessId);
    files.forEach(f => {
        formData.append('photos', f);
    });

    const res = await fetch('/api/posts/upload-photo', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: formData
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || 'Failed to upload photos.');
    }
    return data.photoUrls;
}

/**
 * Open Post Composer Sheet / Modal
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
    onError
}) {
    // Remove any existing composer modal
    const existingModal = document.getElementById('calzadaComposerModal');
    if (existingModal) existingModal.remove();

    const plan = business.plan || 'listed';
    const limit = getPostLimitForPlan(plan);
    const thisMonthCount = countBusinessPostsThisMonth(existingPosts);
    const remainingPosts = limit === null ? 'Unlimited' : Math.max(0, limit - thisMonthCount);
    const limitText = limit === null 
        ? 'Unlimited posts this month.' 
        : `${remainingPosts} of ${limit} posts left this month.`;

    if (limit !== null && remainingPosts <= 0) {
        alert(`You have reached the monthly limit of ${limit} posts for your ${plan === 'plus360' ? 'Listed + 360' : 'Listed'} plan.`);
        return;
    }

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'calzadaComposerModal';
    modalOverlay.className = 'composer-overlay';
    modalOverlay.innerHTML = `
        <div class="composer-container" role="dialog" aria-modal="true" aria-labelledby="composerTitle">
            <div class="composer-header">
                <div>
                    <h2 id="composerTitle" class="composer-title">New post</h2>
                    <div class="composer-sub">Posting as <strong>${escapeHtml(business.name || 'Your business')}</strong>. ${limitText}</div>
                </div>
                <button type="button" class="composer-close-btn" id="btnComposerClose" aria-label="Close composer">
                    <i class="ti ti-x"></i>
                </button>
            </div>

            <form id="composerForm" class="composer-form">
                <!-- Segmented Control: Announcement / Promo / New item -->
                <div class="composer-segmented">
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

                <!-- Promo Ends Date Input (shown only when Promo is chosen) -->
                <div id="promoUntilContainer" class="promo-date-wrap" style="display: none;">
                    <label for="promoUntilInput" class="promo-date-label">Promo ends:</label>
                    <input type="date" id="promoUntilInput" class="promo-date-input" min="${new Date().toISOString().split('T')[0]}">
                </div>

                <!-- Photo Dropzone (Dashed border allowed here) -->
                <div class="composer-dropzone" id="composerDropzone">
                    <i class="ti ti-camera" style="font-size: 24px; color: #378ADD;"></i>
                    <span style="font-size: 13px; font-weight: 500; color: #042C53;">Add up to 5 photos</span>
                    <span style="font-size: 11px; color: #64748B;">JPG, PNG, WebP (max 10MB each)</span>
                    <input type="file" id="composerFileInput" accept="image/jpeg,image/png,image/webp" multiple style="display: none;">
                </div>

                <!-- Photo Thumbnails Strip -->
                <div class="composer-thumbs-strip" id="composerThumbsStrip" style="display: none;"></div>

                <!-- Caption Textarea -->
                <textarea id="composerCaption" class="composer-textarea" rows="3" maxlength="500" placeholder="What's new at your place?"></textarea>

                <div class="composer-footer">
                    <button type="submit" class="composer-submit-btn" id="btnComposerSubmit" disabled>
                        <span>Post</span>
                    </button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modalOverlay);

    // Selected files state
    let selectedFiles = []; // { file, previewUrl }

    const dropzone = modalOverlay.querySelector('#composerDropzone');
    const fileInput = modalOverlay.querySelector('#composerFileInput');
    const thumbsStrip = modalOverlay.querySelector('#composerThumbsStrip');
    const submitBtn = modalOverlay.querySelector('#btnComposerSubmit');
    const captionInput = modalOverlay.querySelector('#composerCaption');
    const promoContainer = modalOverlay.querySelector('#promoUntilContainer');
    const promoInput = modalOverlay.querySelector('#promoUntilInput');
    const form = modalOverlay.querySelector('#composerForm');
    const closeBtn = modalOverlay.querySelector('#btnComposerClose');

    // Close logic
    const closeModal = () => {
        selectedFiles.forEach(item => {
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        });
        modalOverlay.remove();
    };

    closeBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    // Segmented control toggling
    modalOverlay.querySelectorAll('input[name="postLabel"]').forEach(radio => {
        radio.addEventListener('change', () => {
            modalOverlay.querySelectorAll('.segmented-item').forEach(item => item.classList.remove('active'));
            radio.closest('.segmented-item')?.classList.add('active');
            if (radio.value === 'promo') {
                promoContainer.style.display = 'flex';
            } else {
                promoContainer.style.display = 'none';
            }
        });
    });

    // Dropzone click & file change
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const validFiles = files.filter(f => f.size <= 10 * 1024 * 1024);
        const availableSlots = 5 - selectedFiles.length;
        const toAdd = validFiles.slice(0, availableSlots);

        toAdd.forEach(file => {
            selectedFiles.push({
                file,
                previewUrl: URL.createObjectURL(file)
            });
        });

        fileInput.value = '';
        renderThumbs();
    });

    function renderThumbs() {
        if (selectedFiles.length === 0) {
            thumbsStrip.style.display = 'none';
            thumbsStrip.innerHTML = '';
            submitBtn.disabled = true;
            return;
        }

        thumbsStrip.style.display = 'flex';
        submitBtn.disabled = false;
        thumbsStrip.innerHTML = selectedFiles.map((item, idx) => `
            <div class="composer-thumb-item">
                <img src="${item.previewUrl}" alt="Photo ${idx + 1}" class="composer-thumb-img">
                <button type="button" class="composer-thumb-remove" data-thumb-idx="${idx}" aria-label="Remove photo">
                    <i class="ti ti-x"></i>
                </button>
            </div>
        `).join('');

        thumbsStrip.querySelectorAll('.composer-thumb-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.getAttribute('data-thumb-idx'), 10);
                const removed = selectedFiles.splice(idx, 1)[0];
                if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
                renderThumbs();
            });
        });
    }

    // Submit Handler
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (selectedFiles.length === 0) return;

        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>Posting...</span>`;

        try {
            const token = await getFirebaseIdToken();
            const newPostRef = doc(collection(db, 'posts'));
            const newPostId = newPostRef.id;

            // Upload photos via server endpoint
            const filesToUpload = selectedFiles.map(item => item.file);
            const photoUrls = await uploadPostPhotos(newPostId, business.id, filesToUpload, token);

            const selectedLabel = form.querySelector('input[name="postLabel"]:checked')?.value || 'announcement';
            let promoUntilTimestamp = null;
            if (selectedLabel === 'promo' && promoInput.value) {
                const dateObj = new Date(promoInput.value);
                dateObj.setHours(23, 59, 59, 999);
                promoUntilTimestamp = Timestamp.fromDate(dateObj);
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
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>Post</span>`;
            if (onError) onError(err);
            else alert(`Could not create post: ${err.message}`);
        }
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
