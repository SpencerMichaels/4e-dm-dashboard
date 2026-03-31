export interface SceneState {
  mode: 'story' | 'combat'
  locationId?: string
  backgroundImageId?: string    // From location's sceneImageId
  title?: string
}
