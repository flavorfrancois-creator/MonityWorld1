import { useState, useEffect, useCallback } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { 
  CreditCard, Search, Check, X, Pause, Play, Trash2, 
  Smartphone, Clock, CheckCircle, XCircle, Users, Edit, Plus,
  Nfc, QrCode, Copy, Wallet
} from 'lucide-react';

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', XAF: 'FCFA', XOF: 'FCFA', GBP: '£', CNY: '¥', CDF: 'FC', NGN: '₦', GHS: '₵', RUB: '₽', CAD: 'C$', MXN: '$' };

const STATUS_CONFIG = {
  pending: { label: 'En attente', color: 'bg-yellow-500/10 text-yellow-400', icon: Clock },
  approved: { label: 'Approuvée', color: 'bg-green-500/10 text-green-400', icon: CheckCircle },
  stopped: { label: 'Stoppée', color: 'bg-red-500/10 text-red-400', icon: XCircle },
  pending_deletion: { label: 'Suppression en cours', color: 'bg-orange-500/10 text-orange-400', icon: Trash2 }
};

export default function AdminVirtualCards() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showNfcModal, setShowNfcModal] = useState(null);
  
  // Edit NFC Modal
  const [editCardId, setEditCardId] = useState(null);
  const [editCard, setEditCard] = useState(null);
  const [nfcSerial, setNfcSerial] = useState('');
  const [savingNfc, setSavingNfc] = useState(false);
  
  // Create Standalone Card Modal
  const [showCreateStandalone, setShowCreateStandalone] = useState(false);
  const [standaloneForm, setStandaloneForm] = useState({
    name: '',
    currency: 'USD',
    initial_balance: 0,
    limit: 1000,
    nfc_serial_number: ''
  });
  const [creatingStandalone, setCreatingStandalone] = useState(false);

  const fetchCards = useCallback(async () => {
    try {
      const res = await API.get('/admin/virtual-cards', {
        params: { status: statusFilter, page, limit: 20 }
      });
      setCards(res.data.cards || []);
      setTotal(res.data.total || 0);
    } catch (e) {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  const approveCard = async (cardId) => {
    try {
      await API.patch(`/admin/virtual-cards/${cardId}/approve`);
      toast.success('Carte approuvée');
      fetchCards();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const stopCard = async (cardId) => {
    try {
      await API.patch(`/admin/virtual-cards/${cardId}/stop`);
      toast.success('Carte stoppée');
      fetchCards();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const reactivateCard = async (cardId) => {
    try {
      await API.patch(`/admin/virtual-cards/${cardId}/reactivate`);
      toast.success('Carte réactivée');
      fetchCards();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const voteDelete = async (cardId) => {
    if (!window.confirm('Voter pour la suppression de cette carte ?')) return;
    try {
      const res = await API.post(`/admin/virtual-cards/${cardId}/delete-vote`, null, {
        params: { vote: 'approve' }
      });
      toast.success(res.data.message);
      fetchCards();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const makePhysical = async (cardId) => {
    try {
      const res = await API.post(`/admin/virtual-cards/${cardId}/make-physical`);
      toast.success(res.data.message);
      setShowNfcModal({ nfc_code: res.data.nfc_code, barcode: res.data.barcode });
      fetchCards();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const openEditNfc = async (cardId) => {
    try {
      const res = await API.get(`/admin/virtual-cards/${cardId}`);
      setEditCard(res.data);
      setEditCardId(cardId);
      setNfcSerial(res.data.nfc_serial_number || '');
    } catch (e) {
      toast.error('Erreur de chargement');
    }
  };

  const saveNfcAssociation = async () => {
    if (!nfcSerial.trim()) {
      toast.error('Entrez un numéro de série NFC');
      return;
    }
    setSavingNfc(true);
    try {
      const res = await API.patch(`/admin/virtual-cards/${editCardId}/nfc`, {
        nfc_serial_number: nfcSerial.toUpperCase()
      });
      toast.success(res.data.message);
      setShowNfcModal({
        nfc_serial: res.data.nfc_serial_number,
        printed_card_number: res.data.printed_card_number,
        barcode: res.data.barcode
      });
      setEditCardId(null);
      setEditCard(null);
      setNfcSerial('');
      fetchCards();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setSavingNfc(false);
    }
  };

  const createStandaloneCard = async () => {
    if (!standaloneForm.name.trim()) {
      toast.error('Entrez un nom pour la carte');
      return;
    }
    setCreatingStandalone(true);
    try {
      const res = await API.post('/admin/virtual-cards/standalone', {
        ...standaloneForm,
        nfc_serial_number: standaloneForm.nfc_serial_number || null
      });
      toast.success(res.data.message);
      if (res.data.card.printed_card_number) {
        setShowNfcModal({
          printed_card_number: res.data.card.printed_card_number,
          nfc_serial: res.data.card.nfc_serial_number,
          barcode: res.data.card.barcode,
          nfc_code: res.data.card.nfc_code
        });
      }
      setShowCreateStandalone(false);
      setStandaloneForm({ name: '', currency: 'USD', initial_balance: 0, limit: 1000, nfc_serial_number: '' });
      fetchCards();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setCreatingStandalone(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copié !');
  };

  const formatNfcSerial = (value) => {
    // Format as XX:XX:XX:XX:XX:XX:XX
    const clean = value.toUpperCase().replace(/[^0-9A-Z]/g, '');
    const parts = [];
    for (let i = 0; i < clean.length && i < 14; i += 2) {
      parts.push(clean.slice(i, i + 2));
    }
    return parts.join(':');
  };

  const filtered = cards.filter(c => 
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.barcode?.toLowerCase().includes(search.toLowerCase()) ||
    c.owner_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.printed_card_number?.includes(search) ||
    c.nfc_serial_number?.toLowerCase().includes(search.toLowerCase())
  );

  const statusCounts = {
    pending: cards.filter(c => c.status === 'pending').length,
    approved: cards.filter(c => c.status === 'approved').length,
    stopped: cards.filter(c => c.status === 'stopped').length,
    pending_deletion: cards.filter(c => c.status === 'pending_deletion').length
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-20 w-full rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>Gestion des Cartes Virtuelles</h1>
          <p className="text-sm text-muted-foreground">{total} cartes au total</p>
        </div>
        <Button onClick={() => setShowCreateStandalone(true)} data-testid="create-standalone-btn">
          <Plus size={16} className="mr-2" />
          Créer Carte Standalone
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(STATUS_CONFIG).map(([status, config]) => {
          const Icon = config.icon;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
              className={`bg-card border rounded-xl p-4 text-left transition-colors ${
                statusFilter === status ? 'border-primary' : 'border-border hover:border-primary/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.color}`}>
                  <Icon size={16} />
                </div>
                <span className="text-2xl font-bold text-foreground">{statusCounts[status]}</span>
              </div>
              <p className="text-xs text-muted-foreground">{config.label}</p>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher par nom, code-barres, numéro imprimé ou série NFC..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* NFC Result Modal */}
      {showNfcModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md animate-fade-in-up text-center">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
              <Nfc size={32} className="text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Carte NFC Configurée</h3>
            <p className="text-sm text-muted-foreground mt-2">Informations à imprimer sur la carte physique</p>
            
            <div className="bg-secondary/50 rounded-lg p-4 mt-4 space-y-3 text-left">
              {showNfcModal.printed_card_number && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Numéro imprimé (16 chiffres)</p>
                    <p className="font-mono text-lg font-bold text-primary">{showNfcModal.printed_card_number}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => copyToClipboard(showNfcModal.printed_card_number)}>
                    <Copy size={14} />
                  </Button>
                </div>
              )}
              {showNfcModal.nfc_serial && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Numéro de série NFC</p>
                    <p className="font-mono text-sm text-foreground">{showNfcModal.nfc_serial}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => copyToClipboard(showNfcModal.nfc_serial)}>
                    <Copy size={14} />
                  </Button>
                </div>
              )}
              {showNfcModal.barcode && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Code-barres interne</p>
                    <p className="font-mono text-sm text-muted-foreground">{showNfcModal.barcode}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => copyToClipboard(showNfcModal.barcode)}>
                    <Copy size={14} />
                  </Button>
                </div>
              )}
              {showNfcModal.nfc_code && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Code NFC interne</p>
                    <p className="font-mono text-sm text-blue-400">{showNfcModal.nfc_code}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => copyToClipboard(showNfcModal.nfc_code)}>
                    <Copy size={14} />
                  </Button>
                </div>
              )}
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mt-4 text-sm text-yellow-400 text-left">
              Le numéro à 16 chiffres permet aux clients d'associer cette carte lors de la création de leur compte.
            </div>

            <Button className="w-full mt-6" onClick={() => setShowNfcModal(null)}>
              Fermer
            </Button>
          </div>
        </div>
      )}

      {/* Edit NFC Modal */}
      <Dialog open={!!editCardId} onOpenChange={() => { setEditCardId(null); setEditCard(null); setNfcSerial(''); }}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Manrope' }} className="flex items-center gap-2">
              <Edit size={18} className="text-primary" />
              Éditer Carte - Association NFC
            </DialogTitle>
          </DialogHeader>
          
          {editCard && (
            <div className="space-y-4">
              {/* Card Info */}
              <div className="bg-secondary/50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <CreditCard size={24} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{editCard.name}</p>
                    <p className="text-xs text-muted-foreground">{editCard.owner_name || 'Carte Standalone'}</p>
                    <p className="text-xs font-mono text-muted-foreground">{editCard.barcode}</p>
                  </div>
                </div>
              </div>

              {/* Current NFC Info */}
              {editCard.nfc_serial_number && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <p className="text-xs text-blue-400 mb-1">NFC déjà associé</p>
                  <p className="font-mono text-sm text-foreground">{editCard.nfc_serial_number}</p>
                  {editCard.printed_card_number && (
                    <p className="font-mono text-lg font-bold text-primary mt-2">{editCard.printed_card_number}</p>
                  )}
                </div>
              )}

              {/* NFC Serial Input */}
              {!editCard.nfc_serial_number && (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm text-foreground">Numéro de série NFC</Label>
                    <Input
                      placeholder="05:G8:5F:54:22:75:Y5"
                      value={nfcSerial}
                      onChange={(e) => setNfcSerial(formatNfcSerial(e.target.value))}
                      className="font-mono"
                      maxLength={20}
                      data-testid="nfc-serial-input"
                    />
                    <p className="text-xs text-muted-foreground">
                      Format: XX:XX:XX:XX:XX:XX:XX (7 segments de 2 caractères)
                    </p>
                  </div>

                  <div className="bg-secondary/30 rounded-lg p-3 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">Instructions:</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>Scannez la carte NFC physique pour lire son numéro de série</li>
                      <li>Entrez le numéro de série manuellement ou via scanner</li>
                      <li>Un numéro à 16 chiffres sera généré automatiquement</li>
                      <li>Ce numéro sera imprimé sur la carte physique</li>
                    </ul>
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => { setEditCardId(null); setEditCard(null); }}>
                      Annuler
                    </Button>
                    <Button className="flex-1" onClick={saveNfcAssociation} disabled={savingNfc || nfcSerial.length < 20} data-testid="save-nfc-btn">
                      {savingNfc ? 'Enregistrement...' : 'Associer NFC'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Standalone Card Modal */}
      <Dialog open={showCreateStandalone} onOpenChange={setShowCreateStandalone}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Manrope' }} className="flex items-center gap-2">
              <Plus size={18} className="text-primary" />
              Créer Carte Standalone
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm text-blue-400">
              Une carte standalone fonctionne sans compte utilisateur. Elle peut être rechargée et utilisée directement.
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-foreground">Nom de la carte *</Label>
              <Input
                placeholder="Ex: Carte Prépayée #001"
                value={standaloneForm.name}
                onChange={(e) => setStandaloneForm({ ...standaloneForm, name: e.target.value })}
                data-testid="standalone-name-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm text-foreground">Devise</Label>
                <Select value={standaloneForm.currency} onValueChange={(v) => setStandaloneForm({ ...standaloneForm, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['USD', 'EUR', 'XAF', 'XOF', 'CDF'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-foreground">Solde initial</Label>
                <Input
                  type="number"
                  value={standaloneForm.initial_balance}
                  onChange={(e) => setStandaloneForm({ ...standaloneForm, initial_balance: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-foreground">Limite de dépense</Label>
              <Input
                type="number"
                value={standaloneForm.limit}
                onChange={(e) => setStandaloneForm({ ...standaloneForm, limit: parseFloat(e.target.value) || 1000 })}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-foreground">Numéro de série NFC (optionnel)</Label>
              <Input
                placeholder="05:G8:5F:54:22:75:Y5"
                value={standaloneForm.nfc_serial_number}
                onChange={(e) => setStandaloneForm({ ...standaloneForm, nfc_serial_number: formatNfcSerial(e.target.value) })}
                className="font-mono"
                maxLength={20}
              />
              <p className="text-xs text-muted-foreground">
                Si fourni, un numéro à 16 chiffres sera généré pour l'impression
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreateStandalone(false)}>
                Annuler
              </Button>
              <Button className="flex-1" onClick={createStandaloneCard} disabled={creatingStandalone} data-testid="create-standalone-submit">
                {creatingStandalone ? 'Création...' : 'Créer la carte'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cards Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Carte</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Propriétaire</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Codes</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Solde</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Statut</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((card, i) => {
                const StatusIcon = STATUS_CONFIG[card.status]?.icon || Clock;
                return (
                  <tr key={card.id} className={`border-t border-border ${i % 2 === 0 ? '' : 'bg-secondary/20'}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          card.is_standalone ? 'bg-purple-500/10' : card.is_physical ? 'bg-blue-500/10' : 'bg-primary/10'
                        }`}>
                          {card.is_standalone ? (
                            <Wallet size={16} className="text-purple-400" />
                          ) : card.is_physical ? (
                            <Nfc size={16} className="text-blue-400" />
                          ) : (
                            <CreditCard size={16} className="text-primary" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{card.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {card.currency}
                            {card.is_standalone && <span className="ml-1 text-purple-400">• Standalone</span>}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {card.owner_name || <span className="text-muted-foreground italic">Sans compte</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        <p className="font-mono text-xs text-muted-foreground">{card.barcode}</p>
                        {card.nfc_code && <p className="font-mono text-xs text-blue-400">{card.nfc_code}</p>}
                        {card.printed_card_number && (
                          <p className="font-mono text-xs font-semibold text-primary">{card.printed_card_number}</p>
                        )}
                        {card.nfc_serial_number && (
                          <p className="font-mono text-[10px] text-muted-foreground">{card.nfc_serial_number}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold text-foreground">
                        {CURRENCY_SYMBOLS[card.currency]}{card.balance?.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${STATUS_CONFIG[card.status]?.color}`}>
                        <StatusIcon size={12} />
                        {STATUS_CONFIG[card.status]?.label}
                      </span>
                      {card.status === 'pending_deletion' && (
                        <p className="text-xs text-muted-foreground mt-1">{card.delete_votes?.length || 0}/3 votes</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Edit NFC Button */}
                        <Button size="sm" variant="outline" onClick={() => openEditNfc(card.id)} title="Éditer NFC" data-testid={`edit-nfc-${card.id}`}>
                          <Edit size={14} />
                        </Button>
                        
                        {card.status === 'pending' && (
                          <Button size="sm" onClick={() => approveCard(card.id)} title="Approuver">
                            <Check size={14} />
                          </Button>
                        )}
                        {card.status === 'approved' && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => stopCard(card.id)} title="Stopper">
                              <Pause size={14} />
                            </Button>
                            {!card.is_physical && (
                              <Button size="sm" variant="outline" onClick={() => makePhysical(card.id)} title="Créer carte NFC">
                                <Smartphone size={14} />
                              </Button>
                            )}
                          </>
                        )}
                        {card.status === 'stopped' && (
                          <Button size="sm" variant="outline" onClick={() => reactivateCard(card.id)} title="Réactiver">
                            <Play size={14} />
                          </Button>
                        )}
                        {card.status === 'pending_deletion' && (
                          <Button size="sm" variant="destructive" onClick={() => voteDelete(card.id)} title="Voter suppression">
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {filtered.length === 0 && (
          <div className="p-12 text-center">
            <CreditCard size={40} className="mx-auto text-muted-foreground mb-3 opacity-50" />
            <p className="text-muted-foreground">Aucune carte trouvée</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            Précédent
          </Button>
          <span className="px-4 py-2 text-sm text-muted-foreground">
            Page {page} / {Math.ceil(total / 20)}
          </span>
          <Button variant="outline" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}>
            Suivant
          </Button>
        </div>
      )}
    </div>
  );
}
