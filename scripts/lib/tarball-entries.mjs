export function parseTarballListing(listing) {
  return listing.split(/\r?\n/).filter(Boolean);
}
