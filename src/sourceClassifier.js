function classifyUrl(url, snippet = '', title = '') {
  const lowerUrl = String(url || '').toLowerCase();
  const lowerText = `${String(snippet || '')} ${String(title || '')}`.toLowerCase();

  if (lowerUrl.includes('familysearch.org')) return 'familysearch';
  if (lowerUrl.includes('myheritage.com')) return 'myheritage';
  if (lowerUrl.includes('geneanet.org')) return 'geneanet';
  if (lowerUrl.includes('findagrave.com')) return 'findagrave';
  if (lowerUrl.includes('billiongraves.com')) return 'billiongraves';
  if (lowerUrl.includes('/cemeter') || lowerText.includes('cemitério') || lowerText.includes('cemetery')) return 'cemetery';
  if (lowerText.includes('obitu') || lowerUrl.includes('obituaries') || lowerUrl.includes('obituary')) return 'newspaper';
  if (lowerText.includes('registro civil') || lowerUrl.includes('registro-civil') || lowerUrl.includes('civilregister')) return 'civil_registry';
  if (lowerText.includes('paroquia') || lowerText.includes('igreja') || lowerUrl.includes('/church')) return 'church_record';
  if (lowerText.includes('family tree') || lowerText.includes('árvore') || lowerText.includes('genealogy tree') || lowerUrl.includes('/tree/')) return 'genealogy_tree';
  if (lowerText.includes('arquivo') || lowerText.includes('archive') || lowerUrl.includes('/archive')) return 'public_archive';
  if (lowerUrl.includes('login') || lowerText.includes('sign in') || lowerText.includes('entrar')) return 'blocked_or_manual';
  return 'generic_web';
}

module.exports = {
  classifyUrl
};
