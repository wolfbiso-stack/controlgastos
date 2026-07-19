import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, LogOut, Eye, EyeOff } from 'lucide-react'
import CardItem from './CardItem'

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(amount)
}

export default function Dashboard({ session }) {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [globalDebt, setGlobalDebt] = useState(0)
  const [showDebt, setShowDebt] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({
    owner_name: '',
    card_name: '',
    payment_date: ''
  })

  useEffect(() => {
    fetchCards()
    fetchGlobalDebt()
  }, [])

  const fetchGlobalDebt = async () => {
    try {
      const { data, error } = await supabase.from('purchases').select('*')
      if (!error && data) {
        const totalPurchasesAmount = data.reduce((acc, p) => acc + parseFloat(p.total_amount || 0), 0)
        const totalPaidAmount = data.reduce((acc, p) => {
          if (p.is_msi) {
            return acc + (p.current_payment_number * parseFloat(p.monthly_payment || 0))
          }
          return acc + (p.current_payment_number > 0 ? parseFloat(p.total_amount || 0) : 0)
        }, 0)
        setGlobalDebt(totalPurchasesAmount - totalPaidAmount)
      }
    } catch (error) {
      console.error(error)
    }
  }

  const fetchCards = async () => {
    try {
      const { data, error } = await supabase
        .from('cards')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setCards(data || [])
    } catch (error) {
      console.error('Error fetching cards:', error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddCard = async (e) => {
    e.preventDefault()
    try {
      const { data, error } = await supabase
        .from('cards')
        .insert([
          {
            user_id: session.user.id,
            owner_name: formData.owner_name,
            card_name: formData.card_name,
            payment_date: formData.payment_date
          }
        ])
        .select()

      if (error) throw error
      
      setCards([data[0], ...cards])
      setShowAddForm(false)
      setFormData({ owner_name: '', card_name: '', payment_date: '' })
    } catch (error) {
      alert('Error añadiendo tarjeta: ' + error.message)
    }
  }

  const refreshData = () => {
    fetchCards()
    fetchGlobalDebt()
  }

  return (
    <div>
      <header className="flex-between" style={{ marginBottom: '16px' }}>
        <h2 className="text-gradient">Mis Tarjetas</h2>
        <button className="btn-icon" onClick={() => supabase.auth.signOut()} title="Cerrar sesión">
          <LogOut size={20} />
        </button>
      </header>



      <button className="btn" style={{ width: '100%' }} onClick={() => setShowAddForm(true)}>
        <Plus size={20} /> Agregar Tarjeta
      </button>

      {showAddForm && (
        <div className="glass-panel" style={{ marginTop: '20px', padding: '20px' }}>
          <h3 style={{ marginBottom: '16px' }}>Nueva Tarjeta</h3>
          <form onSubmit={handleAddCard}>
            <div className="form-group">
              <label>Nombre del Titular (Dueño)</label>
              <input
                type="text"
                required
                value={formData.owner_name}
                onChange={(e) => setFormData({...formData, owner_name: e.target.value})}
                placeholder="Ej. Juan Pérez"
              />
            </div>
            <div className="form-group">
              <label>Nombre de la Tarjeta</label>
              <input
                type="text"
                required
                value={formData.card_name}
                onChange={(e) => setFormData({...formData, card_name: e.target.value})}
                placeholder="Ej. Nu, Banamex Oro"
              />
            </div>
            <div className="form-group">
              <label>Fecha de Pago</label>
              <input
                type="text"
                required
                value={formData.payment_date}
                onChange={(e) => setFormData({...formData, payment_date: e.target.value})}
                placeholder="Ej. Día 15 de cada mes"
              />
            </div>
            <div className="flex-between" style={{ marginTop: '20px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn">
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', marginTop: '40px' }}><div className="spinner" style={{margin: '0 auto'}}></div></div>
      ) : (
        <div className="card-list">
          {cards.length === 0 ? (
            <p style={{ textAlign: 'center', marginTop: '40px' }}>No tienes tarjetas registradas aún.</p>
          ) : (
            cards.map(card => (
              <CardItem key={card.id} card={card} session={session} onUpdate={refreshData} />
            ))
          )}
        </div>
      )}

      <div className="glass-panel" style={{ padding: '16px', marginTop: '24px', textAlign: 'center' }}>
        <p style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Deuda Total Global</p>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ 
            color: 'var(--danger)', 
            margin: 0, 
            fontSize: '2rem',
            filter: showDebt ? 'none' : 'blur(8px)',
            transition: 'filter 0.3s ease',
            userSelect: showDebt ? 'auto' : 'none'
          }}>
            {formatCurrency(globalDebt)}
          </h2>
          <button className="btn-icon" onClick={() => setShowDebt(!showDebt)}>
            {showDebt ? <EyeOff size={24} /> : <Eye size={24} />}
          </button>
        </div>
      </div>
    </div>
  )
}
