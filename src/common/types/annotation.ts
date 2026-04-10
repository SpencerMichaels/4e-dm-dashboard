/** Lightweight metadata layered on top of compendium entries (images, token crops) */
export interface CompendiumAnnotation {
  imageId?: string
  tokenImageId?: string
  tokenCrop?: { x: number; y: number; size: number }
}
