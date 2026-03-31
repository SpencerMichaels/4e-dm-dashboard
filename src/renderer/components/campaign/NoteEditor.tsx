import { useState, useEffect, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import type { Note } from '@common/types'

interface Props {
  noteId: string
}

export function NoteEditor({ noteId }: Props) {
  const [note, setNote] = useState<Note | null>(null)
  const [title, setTitle] = useState('')

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Start writing...' }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      if (note) {
        const updated = { ...note, content: JSON.stringify(editor.getJSON()), updatedAt: new Date().toISOString() }
        setNote(updated)
        window.api.note.save(updated)
      }
    },
  })

  useEffect(() => {
    window.api.note.get(noteId).then((n: Note | null) => {
      if (n) {
        setNote(n)
        setTitle(n.title)
        if (editor && n.content) {
          try {
            editor.commands.setContent(JSON.parse(n.content))
          } catch {
            editor.commands.setContent(n.content)
          }
        }
      }
    })
  }, [noteId, editor])

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle)
    if (note) {
      const updated = { ...note, title: newTitle, updatedAt: new Date().toISOString() }
      setNote(updated)
      window.api.note.save(updated)
      // Also update tree
      window.api.note.treeGet().then((tree: any[]) => {
        const updateNode = (nodes: any[]): any[] =>
          nodes.map(n => n.id === noteId ? { ...n, title: newTitle } : { ...n, children: updateNode(n.children) })
        window.api.note.treeSave(updateNode(tree))
      })
    }
  }, [note, noteId])

  if (!note) {
    return <div style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <input
        value={title}
        onChange={e => handleTitleChange(e.target.value)}
        placeholder="Note title"
        style={{
          width: '100%',
          fontSize: 'var(--font-size-2xl)',
          fontWeight: 600,
          border: 'none',
          background: 'transparent',
          marginBottom: 'var(--space-4)',
          padding: 0,
        }}
      />
      <div
        style={{
          minHeight: 300,
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-4)',
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
