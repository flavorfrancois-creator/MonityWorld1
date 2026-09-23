import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { CheckCircle2, XCircle, Eye, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

const TYPE_LABELS = { transfer: 'Transfert', recharge: 'Rechargement', withdrawal: 'Retrait', payment: 'Paiement' };
const STATUS_COLORS = { completed: 'badge-completed', pending: 'badge-pending', rejected: 'badge-rejected' };

export default function AdminTransactions() {
  const [searchParams] = useSearchParams();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [typeFilter, setTypeFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [actionNote, setActionNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const LIMIT = 15;

  const fetchTxs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get(`/admin/transactions?page=${page}&limit=${LIMIT}&status=${statusFilter}&type=${typeFilter}`);
      setTransactions(res.data.transactions || []);
      setTotal(res.data.total || 0);
    } catch (e) { toast.error('Erreur'); }
    finally { setLoading(false); }
  }, [page, statusFilter, typeFilter]);

  useEffect(() => { fetchTxs(); }, [fetchTxs]);

  const handleAction = async (txId, action) => {
    setProcessing(true);
    try {
      const res = await API.patch(`/admin/transactions/${txId}`, { action, note: actionNote || (action === 'approve' ? 'Approuvé' : 'Rejeté') });
      toast.success(res.data.message);
      setSelected(null);
      setActionNote('');
      fetchTxs();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
    finally { setProcessing(false); }
  };

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between animate-fade-in-up">
        <h2 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>Gestion des transactions</h2>
        <span className="text-sm text-muted-foreground">{total} transactions</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 animate-fade-in-up stagger-1">
        <Select value={statusFilter || 'all'} onValueChange={v => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-40 h-9 text-sm" data-testid="tx-status-filter"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="completed">Complété</SelectItem>
            <SelectItem value="rejected">Rejeté</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter || 'all'} onValueChange={v => { setTypeFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-40 h-9 text-sm" data-testid="tx-type-filter"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous types</SelectItem>
            <SelectItem value="transfer">Transfert</SelectItem>
            <SelectItem value="recharge">Rechargement</SelectItem>
            <SelectItem value="withdrawal">Retrait</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in-up stagger-2">
        <div className="overflow-x-auto">
          <table className="w-full" data-testid="transactions-table">
            <thead className="border-b border-border">
              <tr className="text-xs text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">Expéditeur</th>
                <th className="text-left px-4 py-3 font-medium">Destinataire</th>
                <th className="text-left px-4 py-3 font-medium">Montant</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Statut</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">Chargement...</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  <Filter size={24} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Aucune transaction trouvée</p>
                </td></tr>
              ) : transactions.map(tx => (
                <tr key={tx.id} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors" data-testid={`admin-tx-row-${tx.id}`}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{tx.sender_name || 'Système'}</p>
                    <p className="text-xs text-muted-foreground">{tx.sender_phone || '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{tx.receiver_name || '—'}</p>
                    <p className="text-xs text-muted-foreground">{tx.receiver_phone || '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-bold text-foreground">{tx.amount} {tx.currency}</p>
                    <p className="text-xs text-muted-foreground">Frais: {tx.fee}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded-full bg-secondary text-muted-foreground">{TYPE_LABELS[tx.type] || tx.type}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[tx.status] || 'bg-secondary text-muted-foreground'}`}>{tx.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleDateString('fr-FR')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setSelected(tx)} className="w-7 h-7 rounded bg-secondary hover:bg-secondary/80 flex items-center justify-center" data-testid={`view-tx-${tx.id}`}>
                        <Eye size={13} className="text-foreground" />
                      </button>
                      {tx.status === 'pending' && (
                        <>
                          <button onClick={() => handleAction(tx.id, 'approve')} className="w-7 h-7 rounded bg-green-500/10 hover:bg-green-500/20 flex items-center justify-center" data-testid={`approve-tx-${tx.id}`}>
                            <CheckCircle2 size={13} className="text-green-400" />
                          </button>
                          <button onClick={() => handleAction(tx.id, 'reject')} className="w-7 h-7 rounded bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center" data-testid={`reject-tx-${tx.id}`}>
                            <XCircle size={13} className="text-red-400" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}><ChevronLeft size={14} /></Button>
          <span className="text-sm text-muted-foreground">Page {page} sur {pages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pages, p+1))} disabled={page === pages}><ChevronRight size={14} /></Button>
        </div>
      )}

      {/* Detail + Action Dialog */}
      {selected && (
        <Dialog open={!!selected} onOpenChange={() => { setSelected(null); setActionNote(''); }}>
          <DialogContent className="bg-card border-border sm:max-w-md">
            <DialogHeader><DialogTitle style={{fontFamily:'Manrope'}}>Transaction #{selected.id?.slice(-8)}</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Expéditeur', selected.sender_name || 'Système'],
                  ['Destinataire', selected.receiver_name || '—'],
                  ['Montant', `${selected.amount} ${selected.currency}`],
                  ['Frais', `${selected.fee} ${selected.currency}`],
                  ['Type', TYPE_LABELS[selected.type] || selected.type],
                  ['Statut', selected.status],
                  ['Date', new Date(selected.created_at).toLocaleString('fr-FR')],
                  ['Description', selected.description || '—'],
                ].map(([k,v]) => (
                  <div key={k} className="bg-secondary/30 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">{k}</p>
                    <p className="text-sm font-medium text-foreground mt-0.5">{v}</p>
                  </div>
                ))}
              </div>
              {selected.status === 'pending' && (
                <div className="pt-2 space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Note (optionnel)</Label>
                    <Input value={actionNote} onChange={e => setActionNote(e.target.value)} placeholder="Raison de la décision..." className="h-10" data-testid="action-note-input" />
                  </div>
                  <div className="flex gap-3">
                    <Button className="flex-1 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20" onClick={() => handleAction(selected.id, 'approve')} disabled={processing} data-testid="dialog-approve-btn">
                      <CheckCircle2 size={14} className="mr-2" />Approuver
                    </Button>
                    <Button className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20" onClick={() => handleAction(selected.id, 'reject')} disabled={processing} data-testid="dialog-reject-btn">
                      <XCircle size={14} className="mr-2" />Rejeter
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
