const UNIVERSITY_NAME = 'Boğaziçi Üniversitesi';
const UNIVERSITY_ID = 'bogazici';
const DEFAULT_CITY = 'İstanbul';
const PAGE_TITLE = 'BuHouse — Boğaziçi Üniversitesi Öğrencileri İçin';
const LISTING_QUERY_KEY = 'ilan';
const GENDER_PREF_PREFIX = 'aranan-cinsiyet:';

let allListings = [];
let editingListingId = null;
let editExistingPhotos = [];

const state = {
  view: 'all',
  type: '',
  district: '',
  budget: '20000+',
  keyword: ''
};

function rowToListing(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    classYear: row.class_year || '',
    type: row.type,
    itemCategory: row.item_category || '',
    city: row.city,
    university: row.university,
    district: row.district,
    budget: Number(row.budget),
    title: row.title,
    description: row.description,
    genderPreference: genderFromRow(row),
    whatsapp: row.whatsapp,
    photos: row.photos || [],
    moveIn: row.move_in || '',
    preferences: row.preferences || [],
    createdAt: row.created_at?.split('T')[0] || '',
  };
}

function genderFromRow(row) {
  if (row.gender_preference) return String(row.gender_preference).trim();
  const encoded = (row.preferences || []).find((pref) => String(pref).startsWith(GENDER_PREF_PREFIX));
  if (encoded) return encoded.slice(GENDER_PREF_PREFIX.length).trim();
  if (row.gender === 'female') return 'Kadın öğrenci';
  if (row.gender === 'male') return 'Erkek öğrenci';
  return row.gender ? String(row.gender).trim() : '';
}

function prefsWithoutEncodedGender(prefs) {
  return (prefs || []).filter((pref) => !String(pref).startsWith(GENDER_PREF_PREFIX));
}

function listingToRow(listing, userId, { useGenderColumn = true } = {}) {
  const preferences = prefsWithoutEncodedGender(listing.preferences);
  if (!useGenderColumn && listing.genderPreference) {
    preferences.push(`${GENDER_PREF_PREFIX}${listing.genderPreference}`);
  }

  const row = {
    user_id: userId,
    name: listing.name,
    class_year: listing.classYear || null,
    type: listing.type,
    item_category: listing.itemCategory || null,
    city: listing.city,
    university: listing.university,
    district: listing.district,
    budget: listing.budget,
    title: listing.title,
    description: listing.description,
    whatsapp: listing.whatsapp,
    photos: listing.photos,
    move_in: listing.moveIn || null,
    preferences,
  };

  if (useGenderColumn) {
    row.gender_preference = listing.genderPreference || null;
  }

  return row;
}

function isMissingGenderColumn(error) {
  const text = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(' ');
  return /gender_preference/i.test(text) || error?.code === 'PGRST204';
}

async function fetchListings() {
  const supabase = window.getSupabase();
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('university', UNIVERSITY_NAME)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(rowToListing);
}

async function createListing(listing, userId) {
  const supabase = window.getSupabase();
  let { data, error } = await supabase
    .from('listings')
    .insert(listingToRow(listing, userId))
    .select('*')
    .single();

  if (error && isMissingGenderColumn(error)) {
    ({ data, error } = await supabase
      .from('listings')
      .insert(listingToRow(listing, userId, { useGenderColumn: false }))
      .select('*')
      .single());
  }

  if (error) throw error;
  return rowToListing(data);
}

async function updateListing(id, listing, userId) {
  const supabase = window.getSupabase();
  let { data, error } = await supabase
    .from('listings')
    .update(listingToRow(listing, userId))
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error && isMissingGenderColumn(error)) {
    ({ data, error } = await supabase
      .from('listings')
      .update(listingToRow(listing, userId, { useGenderColumn: false }))
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single());
  }

  if (error) throw error;
  return rowToListing(data);
}

async function deleteListing(id, userId) {
  const supabase = window.getSupabase();
  const { error } = await supabase
    .from('listings')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}

function getListings() {
  return allListings;
}

function isOwnerListing(item) {
  const currentUser = window.getCurrentUser?.();
  return Boolean(currentUser && item.userId === currentUser.id);
}

function setListingSubmitLabel(text) {
  const submitBtn = document.getElementById('listing-submit-btn');
  if (submitBtn) submitBtn.textContent = text;
}

function formatBudget(amount) {
  return new Intl.NumberFormat('tr-TR').format(amount) + ' ₺/ay';
}

function formatListingPrice(item) {
  if (item.type === 'items') {
    if (!item.budget) return 'Ücretsiz';
    return new Intl.NumberFormat('tr-TR').format(item.budget) + ' ₺';
  }
  return formatBudget(item.budget);
}

function formatDate(dateStr) {
  if (!dateStr) return 'Belirtilmedi';
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(dateStr));
}

function formatRelativeDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Bugün';
  if (diffDays === 1) return 'Dün';
  if (diffDays < 7) return `${diffDays} gün önce`;
  return formatDate(dateStr);
}

function getInitials(name) {
  if (!name?.trim()) return 'K';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatPublicName(name) {
  if (!name?.trim()) return 'Kullanıcı';
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(' ');
}

function formatPublicProfile(name, classYear) {
  const namePart = formatPublicName(name);
  if (classYear?.trim()) return `${namePart} · ${classYear.trim()}`;
  return namePart;
}

function getTypeLabel(type) {
  if (type === 'seeking') return 'Oda arıyor';
  if (type === 'offering') return 'Oda sunuyor';
  if (type === 'items') return 'Eşya ilanı';
  return type;
}

function formatLocation(item) {
  return item.district || 'İstanbul';
}

function getPreferenceLabels(prefs) {
  const map = {
    'no-smoking': 'Sigara yok',
    'pets-ok': 'Evcil hayvan OK'
  };
  return prefs.map((p) => map[p]).filter(Boolean);
}

function filterListings(listings) {
  const currentUser = window.getCurrentUser?.();

  return listings.filter((item) => {
    if (item.university !== UNIVERSITY_NAME) return false;
    if (state.view === 'mine') {
      if (!currentUser || item.userId !== currentUser.id) return false;
    }
    if (state.type && item.type !== state.type) return false;
    if (state.district) {
      const q = state.district.toLowerCase();
      if (!item.district?.toLowerCase().includes(q)) return false;
    }
    if (state.budget && state.budget !== '20000+' && item.budget > Number(state.budget)) return false;
    if (state.keyword) {
      const q = state.keyword.toLowerCase();
      const haystack = [
        item.title,
        item.description,
        item.district,
        item.university,
        item.classYear,
        item.genderPreference,
      ].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function renderPhotoGallery(photos, className = 'detail-gallery') {
  if (!photos?.length) return '';
  const multiClass = photos.length > 1 ? ' detail-gallery-multi' : '';
  return `
    <div class="${className}${multiClass}">
      ${photos.map((src) => `<img src="${escapeHtml(src)}" alt="Eşya fotoğrafı" loading="lazy">`).join('')}
    </div>`;
}

function updateListingsViewUI() {
  const title = document.getElementById('listings-title');
  const emptyTitle = document.getElementById('empty-title');
  const emptyText = document.getElementById('empty-text');

  if (title) {
    title.textContent = state.view === 'mine' ? 'İlanlarım' : 'Keşfet';
  }

  if (emptyTitle && emptyText) {
    if (state.view === 'mine') {
      emptyTitle.textContent = 'Henüz ilan vermedin';
      emptyText.textContent = 'İlan Ver butonuna basarak ilk ilanını oluşturabilirsin.';
    } else {
      emptyTitle.textContent = 'İlan bulunamadı';
      emptyText.textContent = 'Filtreleri değiştirin veya ilk ilanı siz verin.';
    }
  }

  document.querySelectorAll('#view-chips .chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.view === state.view);
  });
}

function setListingsView(view) {
  if (view === 'mine') {
    requireAuth(() => {
      state.view = 'mine';
      updateListingsViewUI();
      renderListings();
      document.querySelector('.listings-section')?.scrollIntoView({ behavior: 'smooth' });
    });
    return;
  }

  state.view = 'all';
  updateListingsViewUI();
  renderListings();
}

function renderListings() {
  updateListingsViewUI();
  const listings = getListings();
  const filtered = filterListings(listings);
  const grid = document.getElementById('listings-grid');
  const empty = document.getElementById('empty-state');
  const countEl = document.getElementById('results-count');
  const statEl = document.getElementById('stat-listings');
  const districtStatEl = document.getElementById('stat-districts');

  statEl.textContent = listings.length;
  if (districtStatEl) {
    const districts = new Set(listings.map((item) => item.district).filter(Boolean));
    districtStatEl.textContent = districts.size;
  }
  countEl.textContent = `${filtered.length} ilan bulundu`;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    grid.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  grid.classList.remove('hidden');
  empty.classList.add('hidden');

  grid.innerHTML = filtered
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((item) => {
      const tags = getPreferenceLabels(item.preferences);
      const coverPhoto = item.photos?.[0];
      return `
        <article class="listing-card" data-id="${item.id}">
          ${coverPhoto ? `<div class="card-photo"><img src="${escapeHtml(coverPhoto)}" alt="" loading="lazy"></div>` : ''}
          <span class="card-badge badge-${item.type}">${getTypeLabel(item.type)}</span>
          <h3 class="card-title">${escapeHtml(item.title)}</h3>
          <div class="card-meta">
            <span>📍 ${escapeHtml(formatLocation(item))}</span>
            <span>🎓 ${escapeHtml(item.university)}</span>
          </div>
          ${item.type !== 'items' && item.genderPreference
            ? `<div class="card-gender">
                <span class="card-gender-label">Aranan cinsiyet</span>
                <span class="card-gender-value">${escapeHtml(item.genderPreference)}</span>
              </div>`
            : ''}
          ${tags.length ? `<div class="card-tags">${tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
          <div class="card-budget">${formatListingPrice(item)}</div>
          <div class="card-footer">
            <div class="card-author">
              <div class="avatar">${getInitials(item.name)}</div>
              <div>
                <div>${escapeHtml(formatPublicProfile(item.name, item.type === 'items' ? '' : item.classYear))}</div>
                <div class="card-date">${formatRelativeDate(item.createdAt)}</div>
              </div>
            </div>
            <div class="card-actions">
              <button type="button" class="btn btn-ghost btn-sm card-share-btn" data-id="${item.id}">Paylaş</button>
              ${isOwnerListing(item) && state.view === 'mine'
                ? `<button type="button" class="btn btn-ghost btn-sm card-edit-btn" data-id="${item.id}">Düzenle</button>`
                : ''}
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  grid.querySelectorAll('.listing-card').forEach((card) => {
    card.addEventListener('click', () => openDetail(card.dataset.id));
  });

  grid.querySelectorAll('.card-share-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = getListings().find((l) => l.id === btn.dataset.id);
      if (item) shareListing(item);
    });
  });

  grid.querySelectorAll('.card-edit-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = getListings().find((l) => l.id === btn.dataset.id);
      if (item) openListingModal(item);
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function parsePhoneDigits(phone) {
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('90')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

function validatePhoneNumber(phone) {
  if (!phone?.trim()) {
    return { valid: false, message: 'Telefon numarası zorunludur.' };
  }
  if (/[a-zA-ZğüşıöçĞÜŞİÖÇ]/.test(phone)) {
    return { valid: false, message: 'Telefon numarasında harf kullanılamaz.' };
  }

  const digits = parsePhoneDigits(phone);
  if (digits.length !== 10) {
    return { valid: false, message: 'Telefon numarası 10 haneli olmalıdır (ör. 0532 123 45 67).' };
  }
  if (!/^5\d{9}$/.test(digits)) {
    return { valid: false, message: 'Geçerli bir cep telefonu girin (5 ile başlamalı).' };
  }

  return {
    valid: true,
    stored: `0${digits}`,
    whatsapp: `90${digits}`,
  };
}

function sanitizePhoneInput(value) {
  const cleaned = value.replace(/[^\d+\s()-]/g, '');
  let digitCount = 0;
  let result = '';

  for (const char of cleaned) {
    if (/\d/.test(char)) {
      if (digitCount >= 12) continue;
      digitCount += 1;
    }
    result += char;
  }

  return result;
}

function normalizeWhatsAppNumber(phone) {
  const result = validatePhoneNumber(phone);
  return result.valid ? result.whatsapp : null;
}

function getWhatsAppNumber(item) {
  if (item.whatsapp) {
    return normalizeWhatsAppNumber(item.whatsapp);
  }
  if (item.contact && !item.contact.includes('@')) {
    return normalizeWhatsAppNumber(item.contact);
  }
  return null;
}

function getListingIdFromLocation() {
  return new URLSearchParams(window.location.search).get(LISTING_QUERY_KEY) || '';
}

function getListingShareUrl(id) {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set(LISTING_QUERY_KEY, id);
  return url.toString();
}

function setListingInUrl(id, { replace = false } = {}) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(LISTING_QUERY_KEY, id);
  else url.searchParams.delete(LISTING_QUERY_KEY);

  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;

  history[replace ? 'replaceState' : 'pushState']({ ilan: id || null }, '', next);
}

function buildListingShareText(item) {
  const lines = [
    `BuHouse ilanı: ${item.title}`,
    `${getTypeLabel(item.type)} · ${formatLocation(item)} · ${formatListingPrice(item)}`,
  ];
  if (item.type !== 'items' && item.genderPreference) {
    lines.push(`Aranan cinsiyet: ${item.genderPreference}`);
  }
  lines.push('', getListingShareUrl(item.id));
  return lines.join('\n');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand('copy');
    input.remove();
    return ok;
  }
}

async function shareListing(item) {
  const url = getListingShareUrl(item.id);
  const text = buildListingShareText(item);

  if (navigator.share) {
    try {
      await navigator.share({
        title: `${item.title} — BuHouse`,
        text,
        url,
      });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  const copied = await copyText(url);
  showToast(copied ? 'İlan linki kopyalandı. Hikâyene veya sohbete yapıştır.' : 'Link kopyalanamadı.');
}

function renderShareSection(item) {
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(buildListingShareText(item))}`;
  return `
    <div class="detail-share">
      <strong class="detail-share-title">İlanı paylaş</strong>
      <div class="detail-share-actions">
        <button type="button" class="btn btn-primary btn-sm" id="detail-share-btn">Paylaş</button>
        <button type="button" class="btn btn-ghost btn-sm" id="detail-copy-link-btn">Linki kopyala</button>
        <a class="btn btn-ghost btn-sm" id="detail-whatsapp-share" href="${whatsappHref}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
      </div>
    </div>`;
}

function bindDetailShareButtons(item) {
  document.getElementById('detail-share-btn')?.addEventListener('click', () => shareListing(item));
  document.getElementById('detail-copy-link-btn')?.addEventListener('click', async () => {
    const copied = await copyText(getListingShareUrl(item.id));
    showToast(copied ? 'İlan linki kopyalandı.' : 'Link kopyalanamadı.');
  });
}

function restorePageTitle() {
  document.title = PAGE_TITLE;
}

function openSharedListingIfNeeded() {
  const id = getListingIdFromLocation();
  if (!id) return;

  const item = getListings().find((listing) => listing.id === id);
  if (!item) {
    showToast('Bu ilan bulunamadı veya kaldırılmış.');
    setListingInUrl(null, { replace: true });
    return;
  }

  openDetail(id, { fromUrl: true });
}

function buildWhatsAppLink(phone, item) {
  const message = item.type === 'items'
    ? `Merhaba, BuHouse'taki "${item.title}" eşya ilanınız hakkında yazıyorum.`
    : `Merhaba, BuHouse'taki "${item.title}" ilanınız hakkında yazıyorum.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function renderContactSection(item) {
  const whatsapp = getWhatsAppNumber(item);

  if (!whatsapp) {
    return `
      <div class="detail-contact">
        <strong>İletişim</strong>
        <span class="contact-email">Telefon numarası belirtilmemiş</span>
      </div>`;
  }

  return `
    <div class="detail-contact">
      <a class="btn-whatsapp" href="${buildWhatsAppLink(whatsapp, item)}" target="_blank" rel="noopener noreferrer">
        <span class="btn-whatsapp-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </span>
        <span class="btn-whatsapp-label">WhatsApp ile yaz</span>
      </a>
    </div>`;
}

function openDetail(id, { fromUrl = false } = {}) {
  const listings = getListings();
  const item = listings.find((l) => l.id === id);
  if (!item) return;

  const tags = getPreferenceLabels(item.preferences);
  const isItems = item.type === 'items';
  const owner = isOwnerListing(item);
  const content = document.getElementById('detail-content');
  content.innerHTML = `
    <div class="detail-header">
      <span class="card-badge badge-${item.type}">${getTypeLabel(item.type)}</span>
      <h2>${escapeHtml(item.title)}</h2>
      <div class="card-meta">
        <span>📍 ${escapeHtml(formatLocation(item))}</span>
        <span>🎓 ${escapeHtml(item.university)}</span>
      </div>
    </div>
    <div class="detail-row"><span>İlan sahibi</span><span>${escapeHtml(formatPublicProfile(item.name, isItems ? '' : item.classYear))}</span></div>
    ${!isItems && item.genderPreference
      ? `<div class="detail-row"><span>Aranan cinsiyet</span><span>${escapeHtml(item.genderPreference)}</span></div>`
      : ''}
    <div class="detail-row"><span>${isItems ? 'Fiyat' : 'Bütçe'}</span><span>${formatListingPrice(item)}</span></div>
    ${!isItems ? `<div class="detail-row"><span>Taşınma</span><span>${formatDate(item.moveIn)}</span></div>` : ''}
    ${tags.length && !isItems ? `<div class="card-tags" style="margin-top:1rem">${tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
    ${renderPhotoGallery(item.photos)}
    <p class="detail-description">${escapeHtml(item.description)}</p>
    ${renderShareSection(item)}
    ${owner ? `
      <div class="detail-owner-actions">
        <button type="button" class="btn btn-primary" id="detail-edit-btn">Düzenle</button>
        <button type="button" class="btn btn-ghost btn-danger" id="detail-delete-btn">Sil</button>
      </div>
    ` : renderContactSection(item)}
  `;

  document.title = `${item.title} — BuHouse`;
  setListingInUrl(id, { replace: fromUrl });
  const modal = document.getElementById('detail-modal');
  if (!modal.open) modal.showModal();
  bindDetailShareButtons(item);

  if (owner) {
    document.getElementById('detail-edit-btn')?.addEventListener('click', () => {
      document.getElementById('detail-modal').close();
      openListingModal(item);
    });
    document.getElementById('detail-delete-btn')?.addEventListener('click', () => {
      handleDeleteListing(item);
    });
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

function populateSelects() {
  // Semt/ilçe serbest metin — önceden tanımlı seçenek yok
}

function selectListingType(type) {
  document.getElementById('form-type').value = type;

  document.querySelectorAll('.type-choice-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });

  document.getElementById('listing-details')?.classList.remove('hidden');
  toggleFormForListingType();
  togglePhotosSection();

  const titleInput = document.getElementById('form-title');
  if (titleInput && !titleInput.value) {
    if (type === 'offering') {
      titleInput.placeholder = 'Bebek\'te ferah oda sunuyorum';
    } else if (type === 'items') {
      titleInput.placeholder = 'Çalışma masası satılıyor — Beşiktaş';
    } else {
      titleInput.placeholder = 'Beşiktaş\'ta sakin ev arkadaşı arıyorum';
    }
  }
}

function toggleFormForListingType() {
  const type = document.getElementById('form-type')?.value;
  const isItems = type === 'items';

  document.getElementById('move-in-group')?.classList.toggle('hidden', isItems);
  document.getElementById('class-year-group')?.classList.toggle('hidden', isItems);
  document.getElementById('gender-preference-group')?.classList.toggle('hidden', isItems);
  const genderInput = document.getElementById('form-gender-preference');
  if (genderInput) genderInput.required = !isItems;
  document.getElementById('room-preferences')?.classList.toggle('hidden', isItems);

  const budgetLabel = document.getElementById('form-budget-label');
  const budgetInput = document.getElementById('form-budget');
  const photosLabel = document.getElementById('form-photos-label');
  const photosHint = document.getElementById('form-photos-hint');
  const descriptionInput = document.getElementById('form-description');

  if (budgetLabel) {
    budgetLabel.textContent = isItems ? 'Fiyat (₺) *' : 'Aylık bütçe (₺) *';
  }
  if (budgetInput) {
    budgetInput.min = isItems ? '0' : '1000';
    budgetInput.placeholder = isItems ? '0 = ücretsiz' : '8000';
  }
  if (photosLabel) {
    photosLabel.textContent = isItems ? 'Eşya fotoğrafları *' : 'Oda fotoğrafları *';
  }
  if (photosHint) {
    photosHint.textContent = isItems
      ? 'En az 1 eşya fotoğrafı yükle (max 5, JPG/PNG/WEBP — 5 MB)'
      : 'Oda sunuyorsan en az 1 fotoğraf yükle (max 5, JPG/PNG/WEBP — 5 MB)';
  }
  if (descriptionInput) {
    descriptionInput.placeholder = isItems
      ? 'Eşyanın durumu, boyutu, teslim yeri ve zamanı...'
      : 'Yaşam tarzın, ev kuralların ve beklentilerin hakkında bilgi ver.';
  }
}

function togglePhotosSection() {
  const type = document.getElementById('form-type')?.value;
  const section = document.getElementById('photos-section');
  const input = document.getElementById('form-photos');
  if (!section || !input) return;

  const needsPhotos = type === 'offering' || type === 'items';
  section.classList.toggle('hidden', !needsPhotos);
  input.required = needsPhotos && editExistingPhotos.length === 0;

  if (!needsPhotos) {
    input.value = '';
    editExistingPhotos = [];
    document.getElementById('photo-preview').innerHTML = '';
  }
}

function renderPhotoPreview() {
  const preview = document.getElementById('photo-preview');
  const files = document.getElementById('form-photos')?.files;
  if (!preview) return;

  preview.innerHTML = '';

  editExistingPhotos.forEach((url) => {
    const wrap = document.createElement('div');
    wrap.className = 'photo-preview-item';
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Mevcut fotoğraf';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'photo-remove';
    removeBtn.setAttribute('aria-label', 'Fotoğrafı kaldır');
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      editExistingPhotos = editExistingPhotos.filter((photoUrl) => photoUrl !== url);
      renderPhotoPreview();
      togglePhotosSection();
    });
    wrap.appendChild(img);
    wrap.appendChild(removeBtn);
    preview.appendChild(wrap);
  });

  const remainingSlots = Math.max(0, 5 - editExistingPhotos.length);
  [...(files || [])].slice(0, remainingSlots).forEach((file) => {
    const wrap = document.createElement('div');
    wrap.className = 'photo-preview-item';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.alt = 'Yeni fotoğraf';
    wrap.appendChild(img);
    preview.appendChild(wrap);
  });
}

function previewPhotos() {
  renderPhotoPreview();
}

function fillListingForm(listing) {
  document.getElementById('form-name').value = listing.name || '';
  document.getElementById('form-class-year').value = listing.type === 'items' ? '' : (listing.classYear || '');
  document.getElementById('form-district').value = listing.district || '';
  document.getElementById('form-budget').value = listing.budget ?? '';
  document.getElementById('form-title').value = listing.title || '';
  document.getElementById('form-gender-preference').value = listing.type === 'items' ? '' : (listing.genderPreference || '');
  document.getElementById('form-description').value = listing.description || '';
  document.getElementById('form-whatsapp').value = listing.whatsapp || '';
  document.getElementById('form-move-in').value = listing.moveIn || '';
  document.getElementById('form-smoking').checked = listing.preferences?.includes('no-smoking') || false;
  document.getElementById('form-pets').checked = listing.preferences?.includes('pets-ok') || false;
}

function resetListingFormState() {
  editingListingId = null;
  editExistingPhotos = [];
  document.getElementById('listing-form').reset();
  document.getElementById('form-type').value = '';
  document.querySelectorAll('.type-choice-btn').forEach((btn) => btn.classList.remove('active'));
  document.getElementById('listing-details')?.classList.add('hidden');
  document.getElementById('listing-type-step')?.classList.remove('hidden');
  document.getElementById('form-university').value = UNIVERSITY_NAME;
  document.getElementById('photo-preview').innerHTML = '';
  document.getElementById('listing-modal-title').textContent = 'Yeni İlan Oluştur';
  setListingSubmitLabel('İlanı Yayınla');
  toggleFormForListingType();
  togglePhotosSection();
}

async function uploadPhotos(files) {
  const user = window.getCurrentUser?.();
  if (!user) throw new Error('Fotoğraf yüklemek için giriş yapmalısınız.');

  const supabase = window.getSupabase();
  const urls = [];

  for (const file of [...files].slice(0, 5)) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from('listing-photos')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    const { data } = supabase.storage.from('listing-photos').getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return urls;
}

function openListingModal(listing = null) {
  resetListingFormState();

  if (listing) {
    if (!isOwnerListing(listing)) {
      showToast('Bu ilanı yalnızca sen düzenleyebilirsin.');
      return;
    }

    editingListingId = listing.id;
    editExistingPhotos = [...(listing.photos || [])];
    document.getElementById('listing-modal-title').textContent = 'İlanı Düzenle';
    document.getElementById('listing-type-step')?.classList.add('hidden');
    selectListingType(listing.type);
    fillListingForm(listing);
    renderPhotoPreview();
    setListingSubmitLabel('İlanı Güncelle');
  }

  document.getElementById('listing-modal').showModal();
}

function closeListingModal() {
  document.getElementById('listing-modal').close();
  resetListingFormState();
}

function resetListingSubmitButton() {
  const submitBtn = document.getElementById('listing-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = false;
    setListingSubmitLabel(editingListingId ? 'İlanı Güncelle' : 'İlanı Yayınla');
  }
}

async function handleDeleteListing(item) {
  if (!isOwnerListing(item)) {
    showToast('Bu ilanı yalnızca sen silebilirsin.');
    return;
  }

  if (!confirm('Bu ilanı silmek istediğine emin misin? Bu işlem geri alınamaz.')) {
    return;
  }

  try {
    const user = window.getCurrentUser();
    await deleteListing(item.id, user.id);
    allListings = allListings.filter((listing) => listing.id !== item.id);
    document.getElementById('detail-modal').close();
    showToast('İlan silindi.');
    renderListings();
  } catch (err) {
    showToast(err.message || 'İlan silinemedi.');
  }
}

async function handleListingSubmit(e) {
  e.preventDefault();

  if (!window.getCurrentUser?.()) {
    requireAuth(() => openListingModal());
    return;
  }

  const type = document.getElementById('form-type').value;
  if (!type) {
    showToast('Önce ilan türünü seç.');
    return;
  }

  const phoneRaw = document.getElementById('form-whatsapp').value.trim();
  const phoneCheck = validatePhoneNumber(phoneRaw);
  if (!phoneCheck.valid) {
    showToast(phoneCheck.message);
    document.getElementById('form-whatsapp').focus();
    return;
  }

  const genderPreference = type === 'items'
    ? ''
    : document.getElementById('form-gender-preference').value.trim();
  if (type !== 'items' && !genderPreference) {
    showToast('Aranan cinsiyeti yaz.');
    document.getElementById('form-gender-preference').focus();
    return;
  }

  let photos = [];

  if (type === 'offering' || type === 'items') {
    photos = [...editExistingPhotos];
    const files = document.getElementById('form-photos').files;

    if (files.length) {
      const remainingSlots = Math.max(0, 5 - editExistingPhotos.length);
      const filesToUpload = [...files].slice(0, remainingSlots);
      try {
        const submitBtn = document.getElementById('listing-submit-btn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Fotoğraflar yükleniyor...';
        const uploaded = filesToUpload.length ? await uploadPhotos(filesToUpload) : [];
        photos = [...photos, ...uploaded].slice(0, 5);
      } catch (err) {
        showToast(err.message);
        resetListingSubmitButton();
        return;
      }
    }

    if (!photos.length) {
      showToast(type === 'items'
        ? 'Eşya ilanı için en az 1 fotoğraf olmalı.'
        : 'Oda sunuyorsan en az 1 fotoğraf olmalı.');
      resetListingSubmitButton();
      return;
    }
  }

  const preferences = [];
  if (document.getElementById('form-smoking').checked) preferences.push('no-smoking');
  if (document.getElementById('form-pets').checked) preferences.push('pets-ok');

  const listing = {
    name: document.getElementById('form-name').value.trim(),
    classYear: type === 'items' ? '' : document.getElementById('form-class-year').value.trim(),
    type,
    itemCategory: '',
    city: DEFAULT_CITY,
    university: UNIVERSITY_NAME,
    district: document.getElementById('form-district').value.trim(),
    budget: Number(document.getElementById('form-budget').value),
    title: document.getElementById('form-title').value.trim(),
    description: document.getElementById('form-description').value.trim(),
    genderPreference,
    whatsapp: phoneCheck.stored,
    photos,
    moveIn: type === 'items' ? '' : document.getElementById('form-move-in').value,
    preferences: type === 'items' ? [] : preferences,
  };

  try {
    const user = window.getCurrentUser();
    const submitBtn = document.getElementById('listing-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = editingListingId ? 'Güncelleniyor...' : 'Yayınlanıyor...';

    if (editingListingId) {
      const saved = await updateListing(editingListingId, listing, user.id);
      const index = allListings.findIndex((entry) => entry.id === editingListingId);
      if (index >= 0) allListings[index] = saved;
      else allListings.unshift(saved);

      closeListingModal();
      showToast('İlanın güncellendi.');
    } else {
      const saved = await createListing(listing, user.id);
      allListings.unshift(saved);

      closeListingModal();
      showToast('İlanınız başarıyla yayınlandı. Linki paylaşabilirsin.');
      openDetail(saved.id);
    }

    renderListings();
  } catch (err) {
    const message = err.message || 'İlan kaydedilemedi.';
    if (message.includes('profiles')) {
      showToast('Profil kaydın bulunamadı. Çıkış yapıp tekrar kayıt olmayı dene.');
    } else {
      showToast(message);
    }
  } finally {
    resetListingSubmitButton();
  }
}

function setupChipGroups(containerId, dataAttr, stateKey, onChange) {
  const container = document.getElementById(containerId);
  container.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const value = chip.dataset[dataAttr] || '';
      if (onChange?.(value) === false) return;

      container.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state[stateKey] = value;
      renderListings();
    });
  });
}

function setupPhoneInput() {
  const input = document.getElementById('form-whatsapp');
  if (!input) return;

  input.addEventListener('input', () => {
    const sanitized = sanitizePhoneInput(input.value);
    if (sanitized !== input.value) {
      input.value = sanitized;
    }
    input.setCustomValidity('');
  });

  input.addEventListener('blur', () => {
    const check = validatePhoneNumber(input.value.trim());
    input.setCustomValidity(check.valid ? '' : check.message);
  });
}

function applyHeroSearch({ scroll = false } = {}) {
  state.district = document.getElementById('filter-district').value.trim();
  const budgetValue = document.getElementById('filter-budget').value;
  state.budget = budgetValue || '20000+';
  renderListings();
  if (scroll) {
    document.querySelector('.listings-section')?.scrollIntoView({ behavior: 'smooth' });
  }
}

function init() {
  populateSelects();

  initAuth()
    .then(() => refreshListings())
    .catch((err) => {
      console.error(err);
      showToast('Supabase bağlantısı kurulamadı.');
    });

  document.getElementById('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    applyHeroSearch({ scroll: true });
  });

  document.getElementById('filter-district').addEventListener('input', () => {
    applyHeroSearch({ scroll: false });
  });

  document.getElementById('filter-keyword').addEventListener('input', (e) => {
    state.keyword = e.target.value.trim();
    renderListings();
  });

  setupChipGroups('view-chips', 'view', 'view', (view) => {
    if (view === 'mine') {
      setListingsView('mine');
      return false;
    }
    setListingsView('all');
    return false;
  });
  setupChipGroups('type-chips', 'type', 'type');

  document.getElementById('btn-my-listings')?.addEventListener('click', () => {
    setListingsView('mine');
  });
  document.getElementById('btn-new-listing').addEventListener('click', () => {
    requireAuth(openListingModal);
  });
  document.getElementById('btn-empty-create').addEventListener('click', () => {
    requireAuth(openListingModal);
  });
  document.getElementById('modal-close').addEventListener('click', closeListingModal);
  document.getElementById('modal-cancel').addEventListener('click', closeListingModal);
  document.getElementById('listing-form').addEventListener('submit', handleListingSubmit);
  setupPhoneInput();
  document.querySelectorAll('.type-choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => selectListingType(btn.dataset.type));
  });
  document.getElementById('form-photos')?.addEventListener('change', previewPhotos);
  document.getElementById('detail-close').addEventListener('click', () => {
    document.getElementById('detail-modal').close();
  });

  document.getElementById('detail-modal').addEventListener('close', () => {
    restorePageTitle();
    if (getListingIdFromLocation()) {
      setListingInUrl(null, { replace: true });
    }
  });

  window.addEventListener('popstate', () => {
    const id = getListingIdFromLocation();
    const modal = document.getElementById('detail-modal');
    if (id) {
      openDetail(id, { fromUrl: true });
      return;
    }
    if (modal?.open) modal.close();
  });

  document.getElementById('btn-how-it-works').addEventListener('click', () => {
    document.getElementById('how-it-works').scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('listing-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeListingModal();
  });

  document.getElementById('detail-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) document.getElementById('detail-modal').close();
  });
}

async function refreshListings() {
  try {
    allListings = await fetchListings();
    renderListings();
    openSharedListingIfNeeded();
  } catch (err) {
    console.error(err);
    showToast('İlanlar yüklenemedi.');
    allListings = [];
    renderListings();
  }
}

document.addEventListener('DOMContentLoaded', init);
window.setListingsView = setListingsView;
