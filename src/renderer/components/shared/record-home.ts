import { createContext, useContext } from 'react'

/**
 * Where the entry being shown lives: "library" for a Library entry, otherwise undefined (the open campaign).
 * Art uploaded for a Library entry is stored with the Library, so it shows in every campaign.
 */
export const RecordHomeContext = createContext<string | undefined>(undefined)
export const useRecordHome = () => useContext(RecordHomeContext)
