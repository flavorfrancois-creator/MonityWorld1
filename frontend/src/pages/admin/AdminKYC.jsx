import { useState, useEffect, useCallback } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Switch } from '../../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { 
  Search, ChevronLeft, ChevronRight, Eye, CheckCircle2, XCircle, 
  User, FileText, Calendar, Phone, Mail, MapPin, Download, ZoomIn, ZoomOut,
  Clock, Shield, AlertTriangle, Image as ImageIcon, RotateCw, X, Scan,
  Home, Briefcase, Building, AlertCircle, MessageSquare, CheckCheck, Loader2,
  Settings, Sparkles, RotateCcw, ThumbsUp
} from 'lucide-react';

const DOC_TYPES = {
  national_id: "Carte d'identité nationale",
  passport: 'Passeport',
  voter_card: "Carte d'électeur",
  driving_license: 'Permis de conduire',
  id_card: 'Carte d\'identité',
  driver_license: 'Permis de conduire',
  residence_permit: 'Titre de séjour',
  selfie: 'Selfie avec document'
};

const SIDE_LABELS = {
  front: 'Recto',
  back: 'Verso'
};

const KYC_STATUSES = { 
  pending: { label: 'En attente', color: 'bg-secondary text-muted-foreground' },
  incomplete: { label: 'Incomplet', color: 'bg-orange-500/10 text-orange-400' },
  submitted: { label: 'Soumis', color: 'bg-blue-500/10 text-blue-400' },
  pre_approved: { label: 'Pré-approuvé', color: 'bg-purple-500/10 text-purple-400' },
  clarification_needed: { label: 'Clarification requise', color: 'bg-orange-500/10 text-orange-400' },
  approved: { label: 'Approuvé', color: 'bg-green-500/10 text-green-400' },
  rejected: { label: 'Rejeté', color: 'bg-red-500/10 text-red-400' }
};

const DISCREPANCY_STATUS = {
  pending: { label: 'En attente', color: 'bg-orange-500/10 text-orange-400' },
  clarified: { label: 'Clarifié', color: 'bg-blue-500/10 text-blue-400' },
  resolved: { label: 'Résolu', color: 'bg-green-500/10 text-green-400' },
  rejected: { label: 'Rejeté', color: 'bg-red-500/10 text-red-400' }
};

// Enhanced Image Preview Modal Component
function ImagePreviewModal({ imageUrl, onClose, documentInfo }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  if (!imageUrl) return null;

  return (
    <Dialog open={!!imageUrl} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border sm:max-w-5xl max-h-[95vh] p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
          <div className="flex items-center gap-3">
            {documentInfo && (
              <div>
                <p className="text-sm font-medium text-foreground">
                  {DOC_TYPES[documentInfo.document_type] || documentInfo.document_type}
                  {documentInfo.side && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {SIDE_LABELS[documentInfo.side] || documentInfo.side}
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{documentInfo.original_filename}</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleZoomOut} title="Zoom arrière">
              <ZoomOut size={18} />
            </Button>
            <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" onClick={handleZoomIn} title="Zoom avant">
              <ZoomIn size={18} />
            </Button>
            <div className="w-px h-6 bg-border mx-1" />
            <Button variant="ghost" size="icon" onClick={handleRotate} title="Pivoter">
              <RotateCw size={18} />
            </Button>
            <div className="w-px h-6 bg-border mx-1" />
            <a 
              href={imageUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 text-sm"
            >
              <Download size={14} /> Télécharger
            </a>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X size={18} />
            </Button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto bg-black/90 flex items-center justify-center p-4" style={{ minHeight: '70vh' }}>
          <img 
            src={imageUrl} 
            alt="Preview" 
            className="max-w-full max-h-full object-contain transition-transform duration-200"
            style={{ 
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center'
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Personal Info Display Component
function PersonalInfoCard({ personalInfo }) {
  if (!personalInfo || Object.keys(personalInfo).length === 0) {
    return (
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-center">
        <AlertTriangle size={24} className="mx-auto text-yellow-500/50 mb-2" />
        <p className="text-sm text-yellow-400">Informations personnelles non soumises</p>
      </div>
    );
  }

  const fields = [
    { key: 'last_name', label: 'Nom', icon: User },
    { key: 'first_name', label: 'Prénom', icon: User },
    { key: 'date_of_birth', label: 'Date de naissance', icon: Calendar },
    { key: 'place_of_birth', label: 'Lieu de naissance', icon: MapPin },
    { key: 'occupation', label: 'Profession', icon: Briefcase },
    { key: 'residence_address', label: 'Adresse', icon: Home },
    { key: 'street', label: 'Rue', icon: Building },
    { key: 'city', label: 'Ville', icon: Building },
    { key: 'postal_code', label: 'Code postal', icon: Building },
    { key: 'postal_box', label: 'Boîte postale', icon: Building },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map(({ key, label, icon: Icon }) => {
        const value = personalInfo[key];
        if (!value) return null;
        return (
          <div key={key} className="bg-secondary/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Icon size={12} />
              <span>{label}</span>
            </div>
            <p className="text-sm font-medium text-foreground truncate" title={value}>{value}</p>
          </div>
        );
      })}
    </div>
  );
}

// Discrepancy Card Component
function DiscrepancyCard({ discrepancy, onResolve, onReject, processing }) {
  const status = DISCREPANCY_STATUS[discrepancy.status] || DISCREPANCY_STATUS.pending;
  
  return (
    <div className="bg-secondary/20 border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-foreground">{discrepancy.field_label}</p>
          <Badge variant="outline" className={`text-xs mt-1 ${status.color}`}>
            {status.label}
          </Badge>
        </div>
        {discrepancy.source === 'ocr_auto' && (
          <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/20">
            <Scan size={10} className="mr-1" /> OCR Auto
          </Badge>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-secondary/30 rounded-lg p-2">
          <span className="text-xs text-muted-foreground block mb-1">Déclaré par l'utilisateur</span>
          <p className="font-medium text-foreground">{discrepancy.expected_value || '-'}</p>
        </div>
        <div className="bg-secondary/30 rounded-lg p-2">
          <span className="text-xs text-muted-foreground block mb-1">Trouvé sur le document</span>
          <p className="font-medium text-foreground">{discrepancy.found_value || '-'}</p>
        </div>
      </div>
      
      {discrepancy.score !== undefined && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Similarité:</span>
          <div className="flex-1 bg-secondary rounded-full h-2">
            <div 
              className={`h-2 rounded-full ${discrepancy.score >= 0.8 ? 'bg-green-500' : discrepancy.score >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${discrepancy.score * 100}%` }}
            />
          </div>
          <span className="text-foreground font-medium">{(discrepancy.score * 100).toFixed(0)}%</span>
        </div>
      )}
      
      {discrepancy.note && (
        <p className="text-xs text-muted-foreground italic">{discrepancy.note}</p>
      )}
      
      {discrepancy.clarification && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
          <p className="text-xs text-blue-400 mb-1">Clarification de l'utilisateur:</p>
          <p className="text-sm text-foreground">{discrepancy.clarification}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Clarifiée le {new Date(discrepancy.clarified_at).toLocaleDateString('fr-FR')}
          </p>
        </div>
      )}
      
      {discrepancy.status === 'pending' || discrepancy.status === 'clarified' ? (
        <div className="flex gap-2 pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 text-red-400 border-red-500/30 hover:bg-red-500/10"
            onClick={() => onReject(discrepancy.id)}
            disabled={processing}
          >
            <XCircle size={14} className="mr-1" /> Rejeter
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 text-green-400 border-green-500/30 hover:bg-green-500/10"
            onClick={() => onResolve(discrepancy.id)}
            disabled={processing}
          >
            <CheckCircle2 size={14} className="mr-1" /> Résoudre
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// Add Discrepancy Dialog
function AddDiscrepancyDialog({ open, onClose, onSubmit, processing }) {
  const [field, setField] = useState('');
  const [expected, setExpected] = useState('');
  const [found, setFound] = useState('');
  const [note, setNote] = useState('');

  const fields = [
    { value: 'last_name', label: 'Nom' },
    { value: 'first_name', label: 'Prénom' },
    { value: 'date_of_birth', label: 'Date de naissance' },
    { value: 'place_of_birth', label: 'Lieu de naissance' },
    { value: 'occupation', label: 'Profession' },
    { value: 'residence_address', label: 'Adresse' },
    { value: 'document', label: 'Document' },
    { value: 'photo', label: 'Photo' },
    { value: 'other', label: 'Autre' }
  ];

  const handleSubmit = () => {
    if (!field) {
      toast.error('Veuillez sélectionner un champ');
      return;
    }
    onSubmit({ field, expected, found, note });
    setField('');
    setExpected('');
    setFound('');
    setNote('');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Signaler une divergence</DialogTitle>
          <DialogDescription>
            Signalez une différence entre les informations déclarées et le document
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Champ concerné *</label>
            <select 
              value={field}
              onChange={e => setField(e.target.value)}
              className="w-full h-10 px-3 rounded-md bg-secondary border border-border text-foreground"
            >
              <option value="">Sélectionner...</option>
              {fields.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Valeur déclarée</label>
            <Input 
              value={expected}
              onChange={e => setExpected(e.target.value)}
              placeholder="Ce que l'utilisateur a déclaré"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Valeur sur le document</label>
            <Input 
              value={found}
              onChange={e => setFound(e.target.value)}
              placeholder="Ce qui est écrit sur le document"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Note</label>
            <Textarea 
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Explication ou remarque..."
              className="resize-none h-20"
            />
          </div>
        </div>
        
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Annuler</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={processing}>
            {processing ? <Loader2 size={14} className="mr-2 animate-spin" /> : <AlertTriangle size={14} className="mr-2" />}
            Signaler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Settings Dialog
function SettingsDialog({ open, onClose, settings, onSave }) {
  const [enabled, setEnabled] = useState(settings?.enabled || false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(enabled);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings size={18} /> Paramètres KYC
          </DialogTitle>
          <DialogDescription>
            Configurez le mode de validation des vérifications d'identité
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-6 space-y-6">
          <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl">
            <div className="space-y-1">
              <p className="font-medium text-foreground flex items-center gap-2">
                <Sparkles size={16} className="text-purple-400" />
                Mode Auto-approbation
              </p>
              <p className="text-xs text-muted-foreground max-w-[250px]">
                Pré-approuve automatiquement les KYC avec OCR &ge;90% et correspondance &ge;90%
              </p>
            </div>
            <Switch 
              checked={enabled} 
              onCheckedChange={setEnabled}
              data-testid="auto-approval-switch"
            />
          </div>
          
          {enabled && (
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 text-sm">
              <p className="text-purple-400 font-medium mb-2">Comment ça fonctionne :</p>
              <ul className="text-muted-foreground space-y-1 text-xs">
                <li>• L'OCR analyse le document et calcule un score de correspondance</li>
                <li>• Si OCR &ge;90% ET Correspondance &ge;90% → <span className="text-purple-400">Pré-approbation automatique</span></li>
                <li>• Le client est notifié que son KYC est en attente de vérification finale</li>
                <li>• Vous recevez une notification pour effectuer la validation définitive</li>
              </ul>
            </div>
          )}
          
          {!enabled && (
            <div className="bg-secondary/30 rounded-xl p-4 text-sm">
              <p className="text-foreground font-medium mb-2">Mode Manuel activé</p>
              <p className="text-xs text-muted-foreground">
                Tous les KYC nécessitent une vérification manuelle complète par un administrateur.
              </p>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Annuler</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : <CheckCircle2 size={14} className="mr-2" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminKYC() {
  const [users, setUsers] = useState([]);
  const [preApprovedUsers, setPreApprovedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [preApprovedTotal, setPreApprovedTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [personalInfo, setPersonalInfo] = useState({});
  const [discrepancies, setDiscrepancies] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [previewDocInfo, setPreviewDocInfo] = useState(null);
  const [activeTab, setActiveTab] = useState('documents');
  const [mainTab, setMainTab] = useState('pending');
  const [ocrStatus, setOcrStatus] = useState(null);
  const [runningOcr, setRunningOcr] = useState(false);
  const [ocrResults, setOcrResults] = useState(null);
  const [showAddDiscrepancy, setShowAddDiscrepancy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const LIMIT = 10;

  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  // Fetch OCR status on mount
  const fetchOcrStatus = useCallback(async () => {
    try {
      const res = await API.get('/admin/ocr/status');
      setOcrStatus(res.data);
      setPreApprovedTotal(res.data.pre_approved_count || 0);
    } catch (e) {
      console.error('Error fetching OCR status:', e);
    }
  }, []);

  useEffect(() => {
    fetchOcrStatus();
  }, [fetchOcrStatus]);

  const fetchPendingKYC = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get(`/admin/kyc/pending?page=${page}&limit=${LIMIT}`);
      setUsers(res.data.users || []);
      setTotal(res.data.total || 0);
    } catch (e) { 
      toast.error('Erreur de chargement'); 
    } finally { 
      setLoading(false); 
    }
  }, [page]);

  const fetchPreApprovedKYC = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get(`/admin/kyc/pre-approved?page=${page}&limit=${LIMIT}`);
      setPreApprovedUsers(res.data.users || []);
      setPreApprovedTotal(res.data.total || 0);
    } catch (e) { 
      toast.error('Erreur de chargement'); 
    } finally { 
      setLoading(false); 
    }
  }, [page]);

  useEffect(() => { 
    if (mainTab === 'pending') {
      fetchPendingKYC();
    } else {
      fetchPreApprovedKYC();
    }
  }, [mainTab, fetchPendingKYC, fetchPreApprovedKYC]);

  const fetchUserDocuments = async (userId) => {
    setLoadingDocs(true);
    setOcrResults(null);
    try {
      const res = await API.get(`/admin/users/${userId}/kyc-documents`);
      setSelectedUser(res.data.user);
      setDocuments(res.data.documents || []);
      setPersonalInfo(res.data.personal_info || {});
      setDiscrepancies(res.data.discrepancies || []);
      setReviewNote('');
      setActiveTab('info');
    } catch (e) { 
      toast.error('Erreur de chargement des documents'); 
    } finally { 
      setLoadingDocs(false); 
    }
  };

  const handleKycAction = async (action) => {
    if (!selectedUser) return;
    setProcessing(true);
    try {
      await API.patch(`/admin/users/${selectedUser.id}/kyc/${action}?note=${encodeURIComponent(reviewNote)}`);
      toast.success(`KYC ${action === 'approve' ? 'approuvé' : 'rejeté'} avec succès`);
      setSelectedUser(null);
      setDocuments([]);
      setPersonalInfo({});
      setDiscrepancies([]);
      fetchPendingKYC();
      fetchOcrStatus();
    } catch (e) { 
      toast.error('Erreur lors du traitement'); 
    } finally { 
      setProcessing(false); 
    }
  };

  const handleFinalApprove = async () => {
    if (!selectedUser) return;
    setProcessing(true);
    try {
      await API.post(`/admin/kyc/${selectedUser.id}/final-approve?note=${encodeURIComponent(reviewNote)}`);
      toast.success('KYC approuvé définitivement');
      setSelectedUser(null);
      setDocuments([]);
      setPersonalInfo({});
      setDiscrepancies([]);
      fetchPreApprovedKYC();
      fetchOcrStatus();
    } catch (e) { 
      toast.error('Erreur lors de l\'approbation finale'); 
    } finally { 
      setProcessing(false); 
    }
  };

  const handleRevokePreApproval = async () => {
    if (!selectedUser) return;
    setProcessing(true);
    try {
      await API.post(`/admin/kyc/${selectedUser.id}/revoke-pre-approval?reason=${encodeURIComponent(reviewNote || 'Vérification manuelle requise')}`);
      toast.success('Pré-approbation révoquée');
      setSelectedUser(null);
      setDocuments([]);
      setPersonalInfo({});
      setDiscrepancies([]);
      fetchPreApprovedKYC();
      fetchPendingKYC();
      fetchOcrStatus();
    } catch (e) { 
      toast.error('Erreur lors de la révocation'); 
    } finally { 
      setProcessing(false); 
    }
  };

  const handleRunOcr = async (documentIndex = 0) => {
    if (!selectedUser) return;
    setRunningOcr(true);
    try {
      const res = await API.post(`/admin/kyc/${selectedUser.id}/ocr-analyze?document_index=${documentIndex}`);
      setOcrResults(res.data);
      toast.success(res.data.message);
      
      // Refresh user data
      const refreshRes = await API.get(`/admin/users/${selectedUser.id}/kyc-documents`);
      setDiscrepancies(refreshRes.data.discrepancies || []);
      setSelectedUser(refreshRes.data.user);
      
      // If pre-approved, refresh the lists
      if (res.data.pre_approved) {
        toast.success('KYC pré-approuvé automatiquement !');
        fetchPendingKYC();
        fetchPreApprovedKYC();
        fetchOcrStatus();
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur lors de l\'analyse OCR');
    } finally {
      setRunningOcr(false);
    }
  };

  const handleResolveDiscrepancy = async (discId) => {
    if (!selectedUser) return;
    setProcessing(true);
    try {
      await API.patch(`/admin/kyc/${selectedUser.id}/discrepancy/${discId}?action=resolve`);
      toast.success('Divergence résolue');
      // Refresh
      const res = await API.get(`/admin/users/${selectedUser.id}/kyc-documents`);
      setDiscrepancies(res.data.discrepancies || []);
      setSelectedUser(res.data.user);
    } catch (e) {
      toast.error('Erreur');
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectDiscrepancy = async (discId) => {
    if (!selectedUser) return;
    setProcessing(true);
    try {
      await API.patch(`/admin/kyc/${selectedUser.id}/discrepancy/${discId}?action=reject`);
      toast.success('Divergence rejetée');
      // Refresh
      const res = await API.get(`/admin/users/${selectedUser.id}/kyc-documents`);
      setDiscrepancies(res.data.discrepancies || []);
      setSelectedUser(res.data.user);
    } catch (e) {
      toast.error('Erreur');
    } finally {
      setProcessing(false);
    }
  };

  const handleAddDiscrepancy = async ({ field, expected, found, note }) => {
    if (!selectedUser) return;
    setProcessing(true);
    try {
      await API.post(`/admin/users/${selectedUser.id}/kyc/discrepancy?field=${field}&expected=${encodeURIComponent(expected)}&found=${encodeURIComponent(found)}&note=${encodeURIComponent(note)}`);
      toast.success('Divergence signalée');
      setShowAddDiscrepancy(false);
      // Refresh
      const res = await API.get(`/admin/users/${selectedUser.id}/kyc-documents`);
      setDiscrepancies(res.data.discrepancies || []);
      setSelectedUser(res.data.user);
    } catch (e) {
      toast.error('Erreur');
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveSettings = async (enabled) => {
    try {
      await API.put(`/admin/kyc/settings?enabled=${enabled}`);
      toast.success(`Mode ${enabled ? 'auto-approbation' : 'manuel'} activé`);
      fetchOcrStatus();
    } catch (e) {
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const pages = Math.ceil((mainTab === 'pending' ? total : preApprovedTotal) / LIMIT);
  const displayedUsers = mainTab === 'pending' ? users : preApprovedUsers;

  const filteredUsers = search 
    ? displayedUsers.filter(u => 
        u.name?.toLowerCase().includes(search.toLowerCase()) || 
        u.phone?.includes(search)
      )
    : displayedUsers;

  const pendingDiscrepancies = discrepancies.filter(d => d.status === 'pending' || d.status === 'clarified');
  const isPreApproved = selectedUser?.kyc_status === 'pre_approved';

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h2 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>
            Vérification d'identité (KYC)
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {total} en attente • {preApprovedTotal} pré-approuvé{preApprovedTotal > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2"
            onClick={() => setShowSettings(true)}
            data-testid="kyc-settings-btn"
          >
            <Settings size={14} />
            Paramètres
          </Button>
          {ocrStatus?.auto_approval?.enabled && (
            <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20">
              <Sparkles size={12} className="mr-1" /> Auto-approbation
            </Badge>
          )}
          {ocrStatus && !ocrStatus.auto_approval?.enabled && (
            <Badge variant="outline" className="bg-secondary text-muted-foreground">
              <Scan size={12} className="mr-1" /> Mode Manuel
            </Badge>
          )}
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={(v) => { setMainTab(v); setPage(1); }} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="pending" className="gap-2">
            <Clock size={14} /> En attente ({total})
          </TabsTrigger>
          <TabsTrigger value="pre_approved" className="gap-2 relative">
            <Sparkles size={14} /> Pré-approuvés
            {preApprovedTotal > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-purple-500 text-white text-xs rounded-full">
                {preApprovedTotal}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search */}
      <div className="relative max-w-md animate-fade-in-up stagger-1">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
          placeholder="Rechercher par nom ou téléphone..." 
          className="pl-9 h-9 text-sm" 
          data-testid="kyc-search-input" 
        />
      </div>

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in-up stagger-2">
        {loading ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            Chargement...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Shield size={48} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">
              {mainTab === 'pending' ? 'Aucune vérification en attente' : 'Aucun KYC pré-approuvé'}
            </p>
          </div>
        ) : filteredUsers.map(u => (
          <div 
            key={u.id} 
            className={`bg-card border rounded-xl p-4 hover:border-primary/50 transition-all cursor-pointer group ${
              u.kyc_status === 'pre_approved' ? 'border-purple-500/30' : 'border-border'
            }`}
            onClick={() => fetchUserDocuments(u.id)}
            data-testid={`kyc-user-card-${u.id}`}
          >
            <div className="flex items-start gap-3">
              <div className="relative">
                {u.profile_image ? (
                  <img 
                    src={`${backendUrl}${u.profile_image}`} 
                    alt={u.name} 
                    className="w-12 h-12 rounded-full object-cover border-2 border-border"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center border-2 border-border">
                    <User size={20} className="text-muted-foreground" />
                  </div>
                )}
                <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-card flex items-center justify-center ${
                  u.kyc_status === 'pre_approved' ? 'bg-purple-500' :
                  u.kyc_status === 'clarification_needed' ? 'bg-orange-500' : 'bg-blue-500'
                }`}>
                  {u.kyc_status === 'pre_approved' ? (
                    <Sparkles size={8} className="text-white" />
                  ) : u.kyc_status === 'clarification_needed' ? (
                    <AlertTriangle size={8} className="text-white" />
                  ) : (
                    <Clock size={8} className="text-white" />
                  )}
                </span>
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground truncate">{u.name}</h3>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Phone size={10} /> {u.phone}
                </p>
                {u.email && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                    <Mail size={10} /> {u.email}
                  </p>
                )}
              </div>
            </div>

            {/* Pre-approval scores */}
            {u.kyc_status === 'pre_approved' && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-purple-400 flex items-center gap-1">
                    <Sparkles size={10} /> Pré-approuvé
                  </span>
                  <span className="text-muted-foreground">
                    OCR: {((u.kyc_ocr_confidence || 0) * 100).toFixed(0)}% | Match: {((u.kyc_match_score || 0) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            )}

            <div className={`mt-3 pt-3 border-t border-border flex items-center justify-between ${u.kyc_status === 'pre_approved' ? 'mt-0 pt-2' : ''}`}>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin size={10} /> {u.country || 'CD'}
                <span className="mx-1">•</span>
                <Calendar size={10} /> {new Date(u.kyc_pre_approved_at || u.kyc_submitted_at || u.created_at).toLocaleDateString('fr-FR')}
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                data-testid={`view-kyc-${u.id}`}
              >
                <Eye size={12} className="mr-1" /> Voir
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 animate-fade-in-up">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} sur {pages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pages, p+1))} disabled={page === pages}>
            <ChevronRight size={14} />
          </Button>
        </div>
      )}

      {/* KYC Review Modal */}
      <Dialog open={!!selectedUser} onOpenChange={() => { setSelectedUser(null); setDocuments([]); setPersonalInfo({}); setDiscrepancies([]); setOcrResults(null); }}>
        <DialogContent className="bg-card border-border sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{fontFamily:'Manrope'}} className="flex items-center gap-2">
              <Shield size={18} className="text-primary" />
              {isPreApproved ? 'Vérification finale' : 'Vérification d\'identité'}
            </DialogTitle>
            <DialogDescription>
              {isPreApproved 
                ? 'Ce KYC a été pré-approuvé automatiquement. Veuillez effectuer une vérification finale.'
                : 'Examinez les informations et documents, puis approuvez ou rejetez la demande'
              }
            </DialogDescription>
          </DialogHeader>

          {loadingDocs ? (
            <div className="py-12 text-center text-muted-foreground">Chargement des documents...</div>
          ) : selectedUser && (
            <div className="space-y-5 pt-2">
              {/* Pre-approval Banner */}
              {isPreApproved && (
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <Sparkles size={20} className="text-purple-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-purple-400">Pré-approuvé automatiquement</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {selectedUser.kyc_pre_approval_note}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs">
                        <span className="text-foreground">
                          OCR: <span className="font-medium text-purple-400">{((selectedUser.kyc_ocr_confidence || 0) * 100).toFixed(0)}%</span>
                        </span>
                        <span className="text-foreground">
                          Correspondance: <span className="font-medium text-purple-400">{((selectedUser.kyc_match_score || 0) * 100).toFixed(0)}%</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* User Info Card */}
              <div className="bg-secondary/30 rounded-xl p-4">
                <div className="flex items-center gap-4">
                  {selectedUser.profile_image ? (
                    <img 
                      src={`${backendUrl}${selectedUser.profile_image}`} 
                      alt={selectedUser.name}
                      className="w-16 h-16 rounded-full object-cover border-2 border-border cursor-pointer hover:border-primary transition-colors"
                      onClick={() => { setPreviewImage(`${backendUrl}${selectedUser.profile_image}`); setPreviewDocInfo({ document_type: 'profile', original_filename: 'Photo de profil' }); }}
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center border-2 border-border">
                      <User size={24} className="text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground text-lg">{selectedUser.name}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Phone size={12} /> {selectedUser.phone}</span>
                      {selectedUser.email && <span className="flex items-center gap-1"><Mail size={12} /> {selectedUser.email}</span>}
                      <span className="flex items-center gap-1"><MapPin size={12} /> {selectedUser.country || 'CD'}</span>
                    </div>
                  </div>
                  <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${KYC_STATUSES[selectedUser.kyc_status]?.color || 'bg-secondary'}`}>
                    {KYC_STATUSES[selectedUser.kyc_status]?.label || selectedUser.kyc_status}
                  </span>
                </div>
              </div>

              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="info" className="gap-2">
                    <User size={14} /> Informations
                  </TabsTrigger>
                  <TabsTrigger value="documents" className="gap-2">
                    <FileText size={14} /> Documents ({documents.length})
                  </TabsTrigger>
                  <TabsTrigger value="discrepancies" className="gap-2 relative">
                    <AlertTriangle size={14} /> 
                    Divergences
                    {pendingDiscrepancies.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center">
                        {pendingDiscrepancies.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>

                {/* Personal Info Tab */}
                <TabsContent value="info" className="mt-4">
                  <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
                    <User size={16} className="text-primary" />
                    Informations personnelles déclarées
                  </h4>
                  <PersonalInfoCard personalInfo={personalInfo} />
                </TabsContent>

                {/* Documents Tab */}
                <TabsContent value="documents" className="mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-foreground flex items-center gap-2">
                      <FileText size={16} className="text-primary" />
                      Documents d'identité ({documents.length})
                    </h4>
                    {documents.length > 0 && !isPreApproved && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleRunOcr(0)}
                        disabled={runningOcr}
                        className="gap-2"
                      >
                        {runningOcr ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Scan size={14} />
                        )}
                        {runningOcr ? 'Analyse...' : 'Analyser OCR'}
                      </Button>
                    )}
                  </div>
                  
                  {documents.length === 0 ? (
                    <div className="bg-secondary/20 rounded-xl p-6 text-center">
                      <AlertTriangle size={32} className="mx-auto text-yellow-500/50 mb-2" />
                      <p className="text-muted-foreground text-sm">Aucun document soumis</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {documents.map((doc, idx) => (
                        <div 
                          key={doc.id || idx} 
                          className="bg-secondary/20 rounded-xl overflow-hidden border border-border hover:border-primary/50 transition-colors group"
                        >
                          <div 
                            className="relative aspect-[4/3] bg-black/20 cursor-pointer"
                            onClick={() => { setPreviewImage(`${backendUrl}${doc.file_path}`); setPreviewDocInfo(doc); }}
                          >
                            {doc.content_type?.startsWith('image/') ? (
                              <img 
                                src={`${backendUrl}${doc.file_path}`} 
                                alt={doc.document_type}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <FileText size={48} className="text-muted-foreground/30" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <ZoomIn size={24} className="text-white" />
                            </div>
                          </div>
                          
                          <div className="p-3">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm text-foreground">
                                {DOC_TYPES[doc.document_type] || doc.document_type}
                              </p>
                              {doc.side && (
                                <Badge variant="outline" className="text-xs">
                                  {SIDE_LABELS[doc.side] || doc.side}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 truncate" title={doc.original_filename}>
                              {doc.original_filename}
                            </p>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-xs text-muted-foreground">
                                {new Date(doc.uploaded_at).toLocaleDateString('fr-FR')}
                              </span>
                              <a 
                                href={`${backendUrl}${doc.file_path}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                                onClick={e => e.stopPropagation()}
                              >
                                <Download size={10} /> Télécharger
                              </a>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* OCR Results */}
                  {ocrResults && (
                    <div className="mt-4 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                      <h5 className="font-medium text-purple-400 flex items-center gap-2 mb-3">
                        <Scan size={16} /> Résultats de l'analyse OCR
                      </h5>
                      {ocrResults.result?.ocr_success ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">Confiance OCR:</span>
                            <span className="text-foreground font-medium">
                              {((ocrResults.result.ocr_confidence || 0) * 100).toFixed(0)}%
                            </span>
                          </div>
                          {ocrResults.result.comparison_result && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground">Score de correspondance:</span>
                              <span className={`font-medium ${ocrResults.result.comparison_result.overall_score >= 0.8 ? 'text-green-400' : 'text-orange-400'}`}>
                                {(ocrResults.result.comparison_result.overall_score * 100).toFixed(0)}%
                              </span>
                            </div>
                          )}
                          {ocrResults.discrepancies_found > 0 && (
                            <p className="text-sm text-orange-400">
                              {ocrResults.discrepancies_found} divergence(s) détectée(s)
                            </p>
                          )}
                          {ocrResults.pre_approved && (
                            <p className="text-sm text-purple-400 font-medium">
                              <Sparkles size={14} className="inline mr-1" />
                              KYC pré-approuvé automatiquement !
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {ocrResults.result?.ocr_error || 'OCR non disponible. Validation manuelle requise.'}
                        </p>
                      )}
                    </div>
                  )}
                </TabsContent>

                {/* Discrepancies Tab */}
                <TabsContent value="discrepancies" className="mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-foreground flex items-center gap-2">
                      <AlertTriangle size={16} className="text-primary" />
                      Divergences ({discrepancies.length})
                    </h4>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setShowAddDiscrepancy(true)}
                      className="gap-2"
                    >
                      <AlertTriangle size={14} /> Signaler
                    </Button>
                  </div>
                  
                  {discrepancies.length === 0 ? (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 text-center">
                      <CheckCheck size={32} className="mx-auto text-green-500/50 mb-2" />
                      <p className="text-sm text-green-400">Aucune divergence détectée</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {discrepancies.map((disc) => (
                        <DiscrepancyCard 
                          key={disc.id}
                          discrepancy={disc}
                          onResolve={handleResolveDiscrepancy}
                          onReject={handleRejectDiscrepancy}
                          processing={processing}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              {/* Review Note */}
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Note de révision (optionnelle)
                </label>
                <Textarea 
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  placeholder="Ajoutez une note pour l'utilisateur..."
                  className="resize-none h-20"
                  data-testid="kyc-review-note"
                />
              </div>

              {/* Action Buttons */}
              {isPreApproved ? (
                <div className="flex gap-3 pt-2">
                  <Button 
                    variant="outline" 
                    className="flex-1 border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                    onClick={handleRevokePreApproval}
                    disabled={processing}
                    data-testid="revoke-pre-approval-btn"
                  >
                    <RotateCcw size={16} className="mr-2" />
                    {processing ? 'Traitement...' : 'Révoquer'}
                  </Button>
                  <Button 
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleFinalApprove}
                    disabled={processing}
                    data-testid="final-approve-btn"
                  >
                    <ThumbsUp size={16} className="mr-2" />
                    {processing ? 'Traitement...' : 'Approuver définitivement'}
                  </Button>
                </div>
              ) : (
                <div className="flex gap-3 pt-2">
                  <Button 
                    variant="outline" 
                    className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                    onClick={() => handleKycAction('reject')}
                    disabled={processing}
                    data-testid="reject-kyc-btn"
                  >
                    <XCircle size={16} className="mr-2" />
                    {processing ? 'Traitement...' : 'Rejeter'}
                  </Button>
                  <Button 
                    className="flex-1 btn-primary-glow"
                    onClick={() => handleKycAction('approve')}
                    disabled={processing || pendingDiscrepancies.length > 0}
                    data-testid="approve-kyc-btn"
                  >
                    <CheckCircle2 size={16} className="mr-2" />
                    {processing ? 'Traitement...' : 'Approuver'}
                  </Button>
                </div>
              )}

              {pendingDiscrepancies.length > 0 && !isPreApproved && (
                <p className="text-xs text-orange-400 text-center">
                  Veuillez résoudre les {pendingDiscrepancies.length} divergence(s) avant d'approuver
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Image Preview Modal */}
      <ImagePreviewModal 
        imageUrl={previewImage} 
        onClose={() => { setPreviewImage(null); setPreviewDocInfo(null); }}
        documentInfo={previewDocInfo}
      />

      {/* Add Discrepancy Dialog */}
      <AddDiscrepancyDialog
        open={showAddDiscrepancy}
        onClose={() => setShowAddDiscrepancy(false)}
        onSubmit={handleAddDiscrepancy}
        processing={processing}
      />

      {/* Settings Dialog */}
      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        settings={ocrStatus?.auto_approval}
        onSave={handleSaveSettings}
      />
    </div>
  );
}
