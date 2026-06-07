import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, CreditCard, Calendar, Edit2, Check, Trash2, ExternalLink } from 'lucide-react'
import { format, addMonths, parseISO } from 'date-fns'
import PaymentModal from './PaymentModal'
import { es } from 'date-fns/locale'

import nuLogo from '../assets/Nu.jpg'
import banamexLogo from '../assets/banamex.png'
import bbvaLogo from '../assets/bbva.png'
import mercadopagoLogo from '../assets/mercadopago.jpg'

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(amount)
}

export default function CardItem({ card, session, onUpdate }) {
  const [purchases, setPurchases] = useState([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPurchaseForm, setShowPurchaseForm] = useState(false)
  const [editingPurchaseId, setEditingPurchaseId] = useState(null)
  const [editingPayment, setEditingPayment] = useState(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentHistory, setPaymentHistory] = useState([])
  
  const [pForm, setPForm] = useState({
    description: '',
    total_amount: '',
    is_msi: false,
    total_months: '',
    purchase_date: new Date().toISOString().split('T')[0]
  })

  useEffect(() => {
    if (expanded && purchases.length === 0) {
      fetchPurchases()
      fetchPaymentHistory()
    }
  }, [expanded])

  const fetchPaymentHistory = async () => {
    const { data } = await supabase
      .from('payment_history')
      .select('*')
      .eq('card_id', card.id)
      .order('payment_date', { ascending: false })
    if (data) setPaymentHistory(data)
  }

  const fetchPurchases = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('purchases')
      .select('*')
      .eq('card_id', card.id)
      .order('created_at', { ascending: false })
      
    if (!error) setPurchases(data || [])
    setLoading(false)
  }

  const handleSavePurchase = async (e) => {
    e.preventDefault()
    
    let monthly_payment = null
    let t_months = pForm.is_msi ? parseInt(pForm.total_months) : 1
    
    if (pForm.is_msi && t_months > 0) {
      monthly_payment = parseFloat(pForm.total_amount) / t_months
    }

    const payload = {
      description: pForm.description,
      total_amount: parseFloat(pForm.total_amount),
      is_msi: pForm.is_msi,
      total_months: pForm.is_msi ? t_months : null,
      monthly_payment: monthly_payment,
      purchase_date: pForm.purchase_date,
    }

    if (!editingPurchaseId) {
      payload.card_id = card.id
      payload.current_payment_number = pForm.is_msi ? 1 : 0
    }

    let response
    if (editingPurchaseId) {
      response = await supabase.from('purchases').update(payload).eq('id', editingPurchaseId).select()
    } else {
      response = await supabase.from('purchases').insert([payload]).select()
    }

    if (response.error) {
      alert(response.error.message)
    } else {
      if (editingPurchaseId) {
        setPurchases(purchases.map(p => p.id === editingPurchaseId ? response.data[0] : p))
      } else {
        setPurchases([response.data[0], ...purchases])
      }
      setShowPurchaseForm(false)
      setEditingPurchaseId(null)
      setPForm({
        description: '', total_amount: '', is_msi: false, total_months: '', purchase_date: new Date().toISOString().split('T')[0]
      })
      if (!expanded) setExpanded(true)
      onUpdate?.()
    }
  }

  const handleEditPurchase = (p) => {
    setPForm({
      description: p.description,
      total_amount: p.total_amount,
      is_msi: p.is_msi,
      total_months: p.total_months || '',
      purchase_date: p.purchase_date
    })
    setEditingPurchaseId(p.id)
    setShowPurchaseForm(true)
  }

  const updateCurrentPayment = async (purchaseId, newNumber) => {
    const { error } = await supabase
      .from('purchases')
      .update({ current_payment_number: newNumber })
      .eq('id', purchaseId)
      
    if (!error) {
      setPurchases(purchases.map(p => p.id === purchaseId ? { ...p, current_payment_number: newNumber } : p))
      setEditingPayment(null)
      onUpdate?.()
    }
  }

  const deletePurchase = async (purchaseId) => {
    if (!window.confirm('¿Eliminar compra?')) return
    const { error } = await supabase.from('purchases').delete().eq('id', purchaseId)
    if (!error) {
      setPurchases(purchases.filter(p => p.id !== purchaseId))
      onUpdate?.()
    }
  }

  const getBankLogo = (cardName) => {
    if (!cardName) return null
    const name = cardName.toLowerCase()
    if (name.includes('nu')) return nuLogo
    if (name.includes('banamex')) return banamexLogo
    if (name.includes('bbva')) return bbvaLogo
    if (name.includes('mercado')) return mercadopagoLogo
    return null
  }

  const logoUrl = getBankLogo(card.card_name)

  const totalPurchasesAmount = purchases.reduce((acc, p) => acc + parseFloat(p.total_amount || 0), 0)
  const totalPaidAmount = purchases.reduce((acc, p) => {
    if (p.is_msi) {
      return acc + (p.current_payment_number * parseFloat(p.monthly_payment || 0))
    }
    return acc + (p.current_payment_number > 0 ? parseFloat(p.total_amount || 0) : 0)
  }, 0)
  const totalRemainingAmount = totalPurchasesAmount - totalPaidAmount
  const totalMonthlyPaymentAmount = purchases.reduce((acc, p) => {
    if (p.is_msi && p.current_payment_number < p.total_months) {
      return acc + parseFloat(p.monthly_payment || 0)
    }
    return acc
  }, 0)

  const handlePayClick = (e) => {
    e.stopPropagation()
    const pending = purchases.filter(p => p.is_msi && p.current_payment_number < p.total_months)
    if (pending.length === 0) {
      alert('No hay compras pendientes de pago a MSI.')
      return
    }
    setShowPaymentModal(true)
  }

  const executePayment = async ({ date, evidenceUrl }) => {
    const updates = purchases
      .filter(p => p.is_msi && p.current_payment_number < p.total_months)
      .map(p => ({
        id: p.id,
        current_payment_number: p.current_payment_number + 1
      }))

    setLoading(true)
    let allSuccess = true
    for (const update of updates) {
      const { error } = await supabase
        .from('purchases')
        .update({ current_payment_number: update.current_payment_number })
        .eq('id', update.id)
      
      if (error) {
        allSuccess = false
        console.error(error)
      }
    }

    if (allSuccess) {
      const { data: historyData } = await supabase.from('payment_history').insert([{
        card_id: card.id,
        amount_paid: totalMonthlyPaymentAmount,
        payment_date: date,
        evidence_url: evidenceUrl
      }]).select()

      if (historyData) setPaymentHistory([historyData[0], ...paymentHistory])

      setPurchases(purchases.map(p => {
        const update = updates.find(u => u.id === p.id)
        if (update) return { ...p, current_payment_number: update.current_payment_number }
        return p
      }))
      onUpdate?.()
      setShowPaymentModal(false)
    } else {
      alert('Hubo un error al actualizar algunos pagos.')
    }
    setLoading(false)
  }

  return (
    <div className="glass-card credit-card-design">
      <div className="card-content">
        <div className="flex-between" onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {logoUrl ? (
                <img src={logoUrl} alt={card.card_name} style={{ width: '36px', height: '36px', objectFit: 'contain', borderRadius: '4px', background: 'white' }} />
              ) : (
                <CreditCard size={24} className="text-gradient" />
              )}
              <h3>{card.card_name}</h3>
            </div>
            <p style={{ color: 'white', fontWeight: 500, marginTop: '4px' }}>{card.owner_name}</p>
            <p style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px', fontSize: '0.8rem' }}>
              <Calendar size={14} /> Pago: {card.payment_date}
            </p>
          </div>
          <button 
            className="btn btn-danger" 
            style={{ padding: '8px 16px', fontSize: '0.9rem' }} 
            onClick={handlePayClick}
            disabled={loading}
          >
            {loading ? '...' : 'PAGAR'}
          </button>
        </div>

        {expanded && (
          <div className="purchase-list">
            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '12px', borderRadius: '8px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>Resumen de la Tarjeta</h4>
              <div className="flex-between" style={{ fontSize: '0.85rem', marginBottom: '4px' }}>
                <span>Total Compras:</span>
                <span style={{ color: 'white', fontWeight: 600 }}>{formatCurrency(totalPurchasesAmount)}</span>
              </div>
              <div className="flex-between" style={{ fontSize: '0.85rem', marginBottom: '4px' }}>
                <span>Total Abonos:</span>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>{formatCurrency(totalPaidAmount)}</span>
              </div>
              <div className="flex-between" style={{ fontSize: '0.85rem', marginBottom: '4px' }}>
                <span>Abono Mensual (MSI):</span>
                <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{formatCurrency(totalMonthlyPaymentAmount)}</span>
              </div>
              <div className="flex-between" style={{ fontSize: '0.85rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '6px', marginTop: '4px' }}>
                <span>Deuda Actual:</span>
                <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{formatCurrency(totalRemainingAmount)}</span>
              </div>
            </div>

            <div className="flex-between">
              <h4 style={{ fontSize: '1rem' }}>Compras</h4>
              <button className="btn-icon" onClick={() => setShowPurchaseForm(!showPurchaseForm)}>
                <Plus size={18} />
              </button>
            </div>

            {showPurchaseForm && (
              <form onSubmit={handleSavePurchase} style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
                <div className="form-group">
                  <label>Concepto</label>
                  <input type="text" required value={pForm.description} onChange={e => setPForm({...pForm, description: e.target.value})} placeholder="Ej. Laptop" />
                </div>
                <div className="form-group">
                  <label>Monto Total</label>
                  <input type="number" step="0.01" required value={pForm.total_amount} onChange={e => setPForm({...pForm, total_amount: e.target.value})} />
                </div>
                <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px' }}>
                  <input type="checkbox" id="msi" checked={pForm.is_msi} onChange={e => setPForm({...pForm, is_msi: e.target.checked})} style={{ width: '20px', height: '20px' }} />
                  <label htmlFor="msi" style={{ fontSize: '1rem', color: 'white', cursor: 'pointer' }}>Meses sin Intereses (MSI)</label>
                </div>
                {pForm.is_msi && (
                  <div className="form-group">
                    <label>¿Cuántos meses?</label>
                    <input type="number" required={pForm.is_msi} value={pForm.total_months} onChange={e => setPForm({...pForm, total_months: e.target.value})} min="2" max="48" />
                  </div>
                )}
                <div className="form-group">
                  <label>Fecha de Compra</label>
                  <input type="date" required value={pForm.purchase_date} onChange={e => setPForm({...pForm, purchase_date: e.target.value})} />
                </div>
                <div className="flex-between" style={{ marginTop: '10px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => { setShowPurchaseForm(false); setEditingPurchaseId(null); setPForm({description: '', total_amount: '', is_msi: false, total_months: '', purchase_date: new Date().toISOString().split('T')[0]}) }}>Cancelar</button>
                  <button type="submit" className="btn">{editingPurchaseId ? 'Guardar Cambios' : 'Guardar Compra'}</button>
                </div>
              </form>
            )}

            {loading ? <div className="spinner" style={{width: '20px', height: '20px'}}></div> : purchases.length === 0 ? <p>No hay compras registradas.</p> : null}

            {purchases.map(p => {
              const purchaseDateObj = parseISO(p.purchase_date)
              const endDate = p.is_msi && p.total_months ? addMonths(purchaseDateObj, p.total_months) : null
              const isPaid = p.is_msi ? p.current_payment_number >= p.total_months : p.current_payment_number > 0
              
              return (
                <div key={p.id} className="purchase-item" style={{ opacity: isPaid ? 0.6 : 1, filter: isPaid ? 'grayscale(30%)' : 'none', transition: 'all 0.3s ease' }}>
                  <div className="flex-between">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ color: 'white', textDecoration: isPaid ? 'line-through' : 'none', opacity: isPaid ? 0.8 : 1 }}>{p.description}</strong>
                      {isPaid && <span className="badge" style={{ background: 'var(--success)', color: 'white', padding: '2px 6px', fontSize: '0.7rem', border: 'none' }}>Pagado</span>}
                    </div>
                    <strong style={{ color: isPaid ? 'var(--text-secondary)' : 'var(--primary)' }}>{formatCurrency(p.total_amount)}</strong>
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                    <p>Fecha: {format(purchaseDateObj, 'dd MMM yyyy', { locale: es })}</p>
                    
                    {p.is_msi && (
                      <div style={{ marginTop: '6px', background: 'rgba(139, 92, 246, 0.1)', padding: '8px', borderRadius: '6px' }}>
                        <div className="flex-between" style={{ marginBottom: '4px' }}>
                          <span className="badge">MSI</span>
                          <span>{formatCurrency(p.monthly_payment)} / mes</span>
                        </div>
                        
                        <div className="flex-between" style={{ alignItems: 'center' }}>
                          <span>Progreso:</span>
                          {editingPayment === p.id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <input 
                                type="number" 
                                min="0" max={p.total_months} 
                                defaultValue={p.current_payment_number}
                                style={{ width: '60px', padding: '4px' }}
                                onBlur={(e) => updateCurrentPayment(p.id, parseInt(e.target.value))}
                                onKeyDown={(e) => e.key === 'Enter' && updateCurrentPayment(p.id, parseInt(e.target.value))}
                                autoFocus
                              />
                              <Check size={16} color="var(--success)" style={{ cursor: 'pointer' }} onClick={(e) => updateCurrentPayment(p.id, parseInt(e.target.previousSibling.value))} />
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <strong>{p.current_payment_number} de {p.total_months}</strong>
                              <Edit2 size={14} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={() => setEditingPayment(p.id)} />
                            </div>
                          )}
                        </div>
                        <p style={{ marginTop: '4px', color: 'var(--success)', fontSize: '0.8rem' }}>
                          Terminas: {format(endDate, 'MMMM yyyy', { locale: es })}
                        </p>
                      </div>
                    )}
                    
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px', gap: '12px' }}>
                      <Edit2 size={16} color="var(--primary)" style={{ cursor: 'pointer' }} onClick={() => handleEditPurchase(p)} title="Editar" />
                      <Trash2 size={16} color="var(--danger)" style={{ cursor: 'pointer' }} onClick={() => deletePurchase(p.id)} title="Eliminar" />
                    </div>
                  </div>
                </div>
              )
            })}
            <div style={{ marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
              <h4 style={{ fontSize: '1rem', marginBottom: '12px' }}>Historial de Pagos</h4>
              {paymentHistory.length === 0 ? (
                <p style={{ fontSize: '0.85rem' }}>No hay pagos registrados.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {paymentHistory.map(ph => (
                    <div key={ph.id} className="flex-between" style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px' }}>
                      <div>
                        <strong style={{ color: 'var(--success)' }}>{formatCurrency(ph.amount_paid)}</strong>
                        <p style={{ fontSize: '0.8rem', marginTop: '2px', color: 'var(--text-secondary)' }}>{ph.payment_date}</p>
                      </div>
                      {ph.evidence_url && (
                        <a href={ph.evidence_url} target="_blank" rel="noreferrer" className="btn-icon" title="Ver Comprobante">
                          <ExternalLink size={18} color="var(--primary)" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {showPaymentModal && (
          <PaymentModal 
            amountToPay={totalMonthlyPaymentAmount}
            onClose={() => setShowPaymentModal(false)}
            onConfirm={executePayment}
          />
        )}
      </div>
    </div>
  )
}
