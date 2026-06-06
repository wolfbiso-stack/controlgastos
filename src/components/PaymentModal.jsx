import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Upload } from 'lucide-react'

export default function PaymentModal({ amountToPay, onClose, onConfirm }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      let evidenceUrl = null

      if (file) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
        
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, file)

        if (uploadError) {
          throw uploadError
        }

        const { data } = supabase.storage
          .from('receipts')
          .getPublicUrl(fileName)
          
        evidenceUrl = data.publicUrl
      }

      await onConfirm({ date, evidenceUrl })
      
    } catch (error) {
      alert('Error al procesar el pago: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(amount)
  }

  return (
    <div className="modal-overlay">
      <div className="glass-card modal-content" style={{ padding: '24px' }}>
        <div className="flex-between" style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: 0 }}>Registrar Pago</h3>
          <button className="btn-icon" onClick={onClose} disabled={loading} type="button">
            <X size={20} />
          </button>
        </div>

        <p style={{ marginBottom: '20px', color: 'var(--text-secondary)' }}>
          Estás a punto de registrar un abono por el monto de <strong style={{ color: 'white' }}>{formatCurrency(amountToPay)}</strong> correspondiente a esta tarjeta.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Fecha de Pago</label>
            <input 
              type="date" 
              required 
              value={date} 
              onChange={(e) => setDate(e.target.value)} 
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Evidencia / Comprobante (Opcional)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label htmlFor="file-upload" className="btn btn-secondary" style={{ cursor: 'pointer', flex: 1, textAlign: 'center', margin: 0 }}>
                <Upload size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                {file ? file.name : 'Seleccionar Imagen'}
              </label>
              <input 
                id="file-upload" 
                type="file" 
                accept="image/*" 
                onChange={handleFileChange} 
                style={{ display: 'none' }} 
                disabled={loading}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-danger" style={{ width: '100%', marginTop: '20px' }} disabled={loading}>
            {loading ? 'Subiendo evidencia...' : 'Confirmar Pago'}
          </button>
        </form>
      </div>
    </div>
  )
}
