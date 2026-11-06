/**
 * Largest file the import will read, in bytes. A year of a household's
 * transactions is about 65 KB, so 5 MB covers decades of real exports, while
 * a wrongly picked photo or video is refused before the browser decodes it.
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
