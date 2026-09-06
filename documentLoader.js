/**
 * DocumentLoader
 * Validates uploaded files and reads them into memory (ArrayBuffer).
 * No file ever touches a server — everything stays in the browser tab.
 */
const DocumentLoader = (() => {
  const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
  const KHATONI_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg'];

  function validate(file) {
    const errors = [];
    const ext = file.name.split('.').pop().toLowerCase();
    const okExt = ['pdf', 'jpg', 'jpeg'];
    if (!okExt.includes(ext)) {
      errors.push(`असमर्थित फ़ाइल प्रकार (Unsupported file): .${ext}`);
    }
    if (file.size > MAX_BYTES) {
      errors.push(`फ़ाइल 5 MB से बड़ी है (File too large): ${(file.size / 1024 / 1024).toFixed(2)} MB`);
    }
    if (file.size === 0) {
      errors.push('फ़ाइल खाली है (Empty file)');
    }
    return { ok: errors.length === 0, errors };
  }

  async function readAsArrayBuffer(file) {
    return await file.arrayBuffer();
  }

  return { validate, readAsArrayBuffer, MAX_BYTES };
})();
