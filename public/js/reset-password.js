/**
 * public/js/reset-password.js
 *
 * Handles the custom reset password flow for Calzada:
 * - Extracts and verifies Firebase action code (oobCode)
 * - Enforces strict password requirements (8-64 chars, 1 uppercase, 1 lowercase, 1 number, 1 symbol, no spaces)
 * - Submits updated password via confirmPasswordReset
 */

import { auth, verifyPasswordResetCode, confirmPasswordReset } from "./firebase-init.js";
import { validatePassword as originalValidatePassword } from "./validators.js";

// Safe wrapper to ensure boolean return if validatePassword returns an object or boolean
function validatePassword(password) {
    if (!password || typeof password !== 'string') return false;
    if (/\s/.test(password)) return false;
    const result = originalValidatePassword(password);
    return typeof result === 'boolean' ? result : Boolean(result && result.ok);
}

// DOM State Panels
const stateVerifying = document.getElementById('stateVerifying');
const stateInvalid = document.getElementById('stateInvalid');
const stateForm = document.getElementById('stateForm');
const stateSuccess = document.getElementById('stateSuccess');

// Elements
const invalidMessageText = document.getElementById('invalidMessageText');
const accountEmailBadge = document.getElementById('accountEmailBadge');
const targetEmailLabel = document.getElementById('targetEmailLabel');
const formAlertBox = document.getElementById('formAlertBox');

const resetForm = document.getElementById('resetPasswordForm');
const newPasswordInput = document.getElementById('newPasswordInput');
const confirmPasswordInput = document.getElementById('confirmPasswordInput');
const newPasswordInlineError = document.getElementById('newPasswordInlineError');
const confirmPasswordInlineError = document.getElementById('confirmPasswordInlineError');

const btnSubmitReset = document.getElementById('btnSubmitReset');
const btnSubmitLabel = document.getElementById('btnSubmitLabel');
const btnSubmitSpinner = document.getElementById('btnSubmitSpinner');

// Checklist Items
const ruleElements = {
    length: document.getElementById('rule-length'),
    lower: document.getElementById('rule-lower'),
    upper: document.getElementById('rule-upper'),
    number: document.getElementById('rule-number'),
    special: document.getElementById('rule-special'),
    nospace: document.getElementById('rule-nospace')
};

function showPanel(targetPanel) {
    [stateVerifying, stateInvalid, stateForm, stateSuccess].forEach(panel => {
        if (panel) panel.classList.remove('active');
    });
    if (targetPanel) targetPanel.classList.add('active');
}

/**
 * Friendly translation for Firebase Auth error codes
 */
function getFriendlyAuthError(code) {
    switch (code) {
        case 'auth/expired-action-code':
            return 'This password reset link has expired. Reset links are only valid for 1 hour.';
        case 'auth/invalid-action-code':
            return 'This password reset link is invalid or has already been used. Please request a new link.';
        case 'auth/user-disabled':
            return 'This commuter account has been suspended. Please contact Calzada support.';
        case 'auth/user-not-found':
            return 'The account associated with this reset link could not be found.';
        case 'auth/weak-password':
            return 'Password does not meet security rules. Please use 8-64 characters with a mix of letters, numbers, and symbols.';
        case 'auth/network-request-failed':
            return 'Network error encountered. Please check your internet connection.';
        default:
            return 'Unable to reset password. Please request a fresh reset link and try again.';
    }
}

// Extract oobCode from URL, then take it out of the address bar and history (it can reset the password)
const urlParams = new URLSearchParams(window.location.search);
const oobCode = urlParams.get('oobCode');
if (oobCode) {
    try { history.replaceState(null, '', window.location.pathname); } catch (_) { /* keep going */ }
}

/**
 * Step 1: Verify the action code on page load
 */
async function verifyResetToken() {
    if (!oobCode) {
        invalidMessageText.textContent = 'No password reset code found in the link. Please request a new reset email.';
        showPanel(stateInvalid);
        return;
    }

    try {
        // verifyPasswordResetCode returns the email associated with the code
        const email = await verifyPasswordResetCode(auth, oobCode);
        if (email) {
            targetEmailLabel.textContent = email;
            accountEmailBadge.style.display = 'inline-flex';
        }
        showPanel(stateForm);
        newPasswordInput.focus();
    } catch (error) {
        console.error('Error verifying action code:', error);
        invalidMessageText.textContent = getFriendlyAuthError(error.code);
        showPanel(stateInvalid);
    }
}

/**
 * Live password checklist: the same rules as sign-up (validators.js, Firebase's symbol list).
 * Each rule shows a shape for its state, not only a colour: ○ not typed yet · ✔ met · ✖ not met,
 * with hidden words for screen readers and a short spoken summary once typing pauses.
 */
const checklistStatus = document.getElementById('passwordChecklistStatus');
let checklistTimer = null;
let checklistSaid = '';
function updateLiveChecklist(password) {
    const val = String(password || '');
    const touched = val.length > 0;
    const { results } = originalValidatePassword(val);
    results.forEach((r) => {
        const el = ruleElements[r.id];
        if (!el) return;
        const state = !touched ? 'idle' : (r.ok ? 'met' : 'unmet');
        el.classList.toggle('is-met', state === 'met');
        el.classList.toggle('is-unmet', state === 'unmet');
        const icon = el.querySelector('.pw-check-icon');
        if (icon) icon.textContent = state === 'met' ? '✔' : state === 'unmet' ? '✖' : '○';
        const sr = el.querySelector('.pw-rule-state');
        if (sr) sr.textContent = state === 'met' ? ': met' : state === 'unmet' ? ': not met' : ': not checked yet';
    });
    clearTimeout(checklistTimer);
    checklistTimer = setTimeout(() => {
        if (!checklistStatus) return;
        const missing = results.filter((r) => !r.ok);
        const msg = !touched ? '' : missing.length
            ? `${results.length - missing.length} of ${results.length} password rules met. Still needed: ${missing.map((r) => r.label).join(', ')}.`
            : 'All password rules met.';
        if (msg !== checklistSaid) { checklistStatus.textContent = msg; checklistSaid = msg; }
    }, 700);
}

newPasswordInput.addEventListener('input', () => {
    updateLiveChecklist(newPasswordInput.value);
    newPasswordInlineError.textContent = '';
    newPasswordInput.classList.remove('is-invalid');
});

confirmPasswordInput.addEventListener('input', () => {
    confirmPasswordInlineError.textContent = '';
    confirmPasswordInput.classList.remove('is-invalid');
});

/**
 * Toggle Password Visibility Buttons
 */
document.querySelectorAll('.toggle-pw-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (!input) return;

        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';

        // Update SVG icon
        btn.innerHTML = isPassword
            ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
            : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    });
});

/**
 * Step 2: Form submission & confirmPasswordReset
 */
resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Reset alert boxes
    formAlertBox.style.display = 'none';
    formAlertBox.textContent = '';
    newPasswordInlineError.textContent = '';
    confirmPasswordInlineError.textContent = '';
    newPasswordInput.classList.remove('is-invalid');
    confirmPasswordInput.classList.remove('is-invalid');

    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    let hasError = false;

    if (!newPassword) {
        newPasswordInlineError.textContent = 'Please enter your new password.';
        newPasswordInput.classList.add('is-invalid');
        hasError = true;
    } else if (!validatePassword(newPassword)) {
        newPasswordInlineError.textContent = 'Password must meet all 6 rules below.';
        newPasswordInput.classList.add('is-invalid');
        hasError = true;
    }

    if (!confirmPassword) {
        confirmPasswordInlineError.textContent = 'Please confirm your new password.';
        confirmPasswordInput.classList.add('is-invalid');
        hasError = true;
    } else if (newPassword && newPassword !== confirmPassword) {
        confirmPasswordInlineError.textContent = 'Passwords do not match.';
        confirmPasswordInput.classList.add('is-invalid');
        hasError = true;
    }

    if (hasError) return;

    // Loading State
    setSubmitting(true);

    try {
        await confirmPasswordReset(auth, oobCode, newPassword);
        showPanel(stateSuccess);
    } catch (error) {
        console.error('Password reset confirmation failed:', error);
        setSubmitting(false);

        if (error.code === 'auth/expired-action-code' || error.code === 'auth/invalid-action-code') {
            invalidMessageText.textContent = getFriendlyAuthError(error.code);
            showPanel(stateInvalid);
        } else {
            formAlertBox.textContent = getFriendlyAuthError(error.code);
            formAlertBox.style.display = 'block';
        }
    }
});

function setSubmitting(isLoading) {
    btnSubmitReset.disabled = isLoading;
    btnSubmitLabel.style.display = isLoading ? 'none' : 'inline';
    btnSubmitSpinner.style.display = isLoading ? 'inline-block' : 'none';
}

// Initialize on page load
verifyResetToken();

