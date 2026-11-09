import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useGames } from '../games'
import Editor from './Editor'
import SchemaEditor from './SchemaEditor'

export default function NewServer() {
  const { games } = useGames()
  const creatable = games.filter((g) => g.caps.includes('create'))
  const [game, setGame] = useState(null)
  const chosen = game || (creatable.length === 1 ? creatable[0].key : null)
  const g = creatable.find((x) => x.key === chosen)
  return (
    <div>
      <Link to="/" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-100"><ArrowLeft size={15} /> Zurück zu den Servern</Link>
      <h1 className="mb-5 text-3xl font-bold uppercase tracking-wider">Neuer Server{g ? ` · ${g.name}` : ''}</h1>
      {!g ? (
        <div>
          <p className="mb-3 text-sm text-ink-300">Für welches Spiel soll der Server sein?</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {creatable.map((x) => (
              <button key={x.key} onClick={() => setGame(x.key)} className="card flex items-center gap-4 p-5 text-left transition hover:border-ink-400">
                <span className="grid h-12 w-12 place-items-center rounded-lg font-display text-lg font-bold text-white" style={{ background: x.color }}>{x.short}</span>
                <span><span className="block font-display text-xl font-semibold">{x.name}</span><span className="text-xs text-ink-300">{x.caps.includes('live') ? 'mit Live-Karte' : 'Start/Stopp und Einstellungen'}</span></span>
              </button>
            ))}
          </div>
        </div>
      ) : g.editor === 'raceroom' ? <Editor game={g.key} /> : <SchemaEditor game={g.key} />}
    </div>
  )
}
