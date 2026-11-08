import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Editor from './Editor'

export default function NewServer() {
  return (
    <div>
      <Link to="/" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-100"><ArrowLeft size={15} /> Zurück zu den Servern</Link>
      <h1 className="mb-5 text-3xl font-bold uppercase tracking-wider">Neuer Server</h1>
      <Editor />
    </div>
  )
}
