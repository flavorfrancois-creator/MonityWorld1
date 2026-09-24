import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import { 
  Search, ChevronLeft, ChevronRight, Edit2, ShieldCheck, ShieldOff, 
  CheckCircle2, XCircle, User, Eye, FileText, Download, ZoomIn, ZoomOut,
  Crown, UserPlus, AlertTriangle, X, RotateCw
} from 'lucide-react';

const ROLES = ['client', 'manager', 'admin'];
const KYC_STATUSES = { 
  pending: 'En attente', 
  incomplete: 'Incomplet',
  submitted: 'Soumis', 
  approved: 'Approuvé', 
  rejected: 'Rejeté' 
};
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

// Enhanced Image Preview Component
function ImagePreviewModal({ imageUrl, onClose, documentInfo }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  return (
    <Dialog open={!!imageUrl} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border sm:max-w-5xl max-h-[95vh] p-0 overflow-hidden">
        {/* Header with controls */}
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
        
        {/* Image container */}
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

export default function AdminUsers() {
  const { user: currentAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [newRole, setNewRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewingKyc, setViewingKyc] = useState(null);
  const [kycDocuments, setKycDocuments] = useState([]);
  const [loadingKyc, setLoadingKyc] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [previewImage, setPreviewImage] = useState(null);
  const [previewDocInfo, setPreviewDocInfo] = useState(null);
  const [promotingUser, setPromotingUser] = useState(null);
  const [promotionRole, setPromotionRole] = useState('manager');
  const [promoting, setPromoting] = useState(false);
  const LIMIT = 15;
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  const isSuperAdmin = currentAdmin?.is_super_admin;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get(`/admin/users?page=${page}&limit=${LIMIT}&search=${search}&role=${roleFilter}`);
      setUsers(res.data.users || []);
      setTotal(res.data.total || 0);
    } catch (e) { toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  }, [page, search, roleFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleUpdateUser = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await API.patch(`/admin/users/${editing.id}`, { role: newRole });
      toast.success('Rôle mis à jour');
      setEditing(null);
      fetchUsers();
    } catch (e) { 
      toast.error(e.response?.data?.detail || 'Erreur'); 
    } finally { 
      setSaving(false); 
    }
  };

  const handleToggleActive = async (userId, currentStatus) => {
    try {
      await API.patch(`/admin/users/${userId}`, { is_active: !currentStatus });
      toast.success(currentStatus ? 'Compte suspendu' : 'Compte activé');
      fetchUsers();
    } catch (e) { toast.error('Erreur'); }
  };

  const handleKycAction = async (userId, action) => {
    try {
      const noteParam = reviewNote ? `?note=${encodeURIComponent(reviewNote)}` : '';
      await API.patch(`/admin/users/${userId}/kyc/${action}${noteParam}`);
      toast.success(`KYC ${action === 'approve' ? 'approuvé' : 'rejeté'}`);
      setViewingKyc(null);
      setKycDocuments([]);
      setReviewNote('');
      fetchUsers();
    } catch (e) { toast.error('Erreur'); }
  };

  const viewUserKyc = async (user) => {
    setLoadingKyc(true);
    setViewingKyc(user);
    try {
      const res = await API.get(`/admin/users/${user.id}/kyc-documents`);
      setKycDocuments(res.data.documents || []);
      setReviewNote('');
    } catch (e) { 
      toast.error('Erreur de chargement des documents'); 
      setKycDocuments([]);
    } finally { 
      setLoadingKyc(false); 
    }
  };

  const handlePromoteUser = async () => {
    if (!promotingUser || !promotionRole) return;
    setPromoting(true);
    try {
      await API.post(`/admin/users/${promotingUser.id}/promote?role=${promotionRole}`);
      toast.success(`${promotingUser.name} a été promu(e) en ${promotionRole === 'admin' ? 'Administrateur' : 'Gestionnaire'}`);
      setPromotingUser(null);
      fetchUsers();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur lors de la promotion');
    } finally {
      setPromoting(false);
    }
  };

  const openImagePreview = (url, docInfo = null) => {
    setPreviewImage(url);
    setPreviewDocInfo(docInfo);
  };

  const pages = Math.ceil(total / LIMIT);

  const kycColor = { 
    pending: 'bg-secondary text-muted-foreground', 
    incomplete: 'bg-orange-500/10 text-orange-400',
    submitted: 'bg-blue-500/10 text-blue-400', 
    approved: 'bg-green-500/10 text-green-400', 
    rejected: 'bg-red-500/10 text-red-400' 
  };
  const roleColor = { 
    admin: 'bg-primary/10 text-primary', 
    manager: 'bg-blue-500/10 text-blue-400', 
    merchant: 'bg-purple-500/10 text-purple-400', 
    client: 'bg-secondary text-muted-foreground' 
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between animate-fade-in-up">
        <h2 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>Gestion des utilisateurs</h2>
        <span className="text-sm text-muted-foreground">{total} utilisateurs</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 animate-fade-in-up stagger-1">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Rechercher par nom ou téléphone..." className="pl-9 h-9 text-sm" data-testid="user-search-input" />
        </div>
        <Select value={roleFilter || 'all'} onValueChange={v => { setRoleFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-36 h-9 text-sm" data-testid="role-filter"><SelectValue placeholder="Rôle" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous rôles</SelectItem>
            {ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in-up stagger-2">
        <div className="overflow-x-auto">
          <table className="w-full" data-testid="users-table">
            <thead className="border-b border-border">
              <tr className="text-xs text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">Utilisateur</th>
                <th className="text-left px-4 py-3 font-medium">Rôle</th>
                <th className="text-left px-4 py-3 font-medium">KYC</th>
                <th className="text-left px-4 py-3 font-medium">Statut</th>
                <th className="text-left px-4 py-3 font-medium">Inscrit le</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">Chargement...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">Aucun utilisateur trouvé</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors" data-testid={`user-row-${u.id}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 relative">
                        <span className="text-xs font-bold text-foreground">{u.name?.charAt(0) || 'U'}</span>
                        {u.is_super_admin && (
                          <Crown size={10} className="absolute -top-1 -right-1 text-yellow-500" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground flex items-center gap-1">
                          {u.name}
                          {u.is_super_admin && <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500/30 ml-1">Super Admin</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground">{u.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleColor[u.role] || 'bg-secondary text-muted-foreground'}`}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${kycColor[u.kyc_status] || 'bg-secondary text-muted-foreground'}`}>{KYC_STATUSES[u.kyc_status] || u.kyc_status}</span>
                      <button 
                        onClick={() => viewUserKyc(u)} 
                        className="w-6 h-6 rounded bg-secondary hover:bg-secondary/80 flex items-center justify-center" 
                        data-testid={`view-kyc-${u.id}`}
                        title="Voir les documents"
                      >
                        <Eye size={12} className="text-foreground" />
                      </button>
                      {u.kyc_status === 'submitted' && (
                        <div className="flex gap-1">
                          <button onClick={() => handleKycAction(u.id, 'approve')} className="w-6 h-6 rounded bg-green-500/10 hover:bg-green-500/20 flex items-center justify-center" data-testid={`approve-kyc-${u.id}`}><CheckCircle2 size={12} className="text-green-400" /></button>
                          <button onClick={() => handleKycAction(u.id, 'reject')} className="w-6 h-6 rounded bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center" data-testid={`reject-kyc-${u.id}`}><XCircle size={12} className="text-red-400" /></button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${u.is_active ? 'badge-completed' : 'badge-rejected'}`}>{u.is_active ? 'Actif' : 'Suspendu'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {/* Promote button - only for super admin and for clients */}
                      {isSuperAdmin && u.role === 'client' && !u.is_super_admin && (
                        <button 
                          onClick={() => { setPromotingUser(u); setPromotionRole('manager'); }}
                          className="w-7 h-7 rounded bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors" 
                          data-testid={`promote-user-${u.id}`}
                          title="Promouvoir en Admin/Manager"
                        >
                          <UserPlus size={13} className="text-primary" />
                        </button>
                      )}
                      <button onClick={() => { setEditing(u); setNewRole(u.role); }} className="w-7 h-7 rounded bg-secondary hover:bg-secondary/80 flex items-center justify-center transition-colors" data-testid={`edit-user-${u.id}`}>
                        <Edit2 size={13} className="text-foreground" />
                      </button>
                      {!u.is_super_admin && (
                        <button onClick={() => handleToggleActive(u.id, u.is_active)} className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${u.is_active ? 'bg-red-500/10 hover:bg-red-500/20' : 'bg-green-500/10 hover:bg-green-500/20'}`} data-testid={`toggle-user-${u.id}`}>
                          {u.is_active ? <ShieldOff size={13} className="text-red-400" /> : <ShieldCheck size={13} className="text-green-400" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}><ChevronLeft size={14} /></Button>
          <span className="text-sm text-muted-foreground">Page {page} sur {pages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pages, p+1))} disabled={page === pages}><ChevronRight size={14} /></Button>
        </div>
      )}

      {/* Edit Dialog */}
      {editing && (
        <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
          <DialogContent className="bg-card border-border sm:max-w-sm">
            <DialogHeader><DialogTitle style={{fontFamily:'Manrope'}}>Modifier {editing.name}</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="bg-secondary/30 rounded-lg p-3 text-sm">
                <p className="text-muted-foreground">Téléphone: <span className="text-foreground">{editing.phone}</span></p>
                <p className="text-muted-foreground mt-1">Compte: <span className="text-foreground font-mono">{editing.account_number}</span></p>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Nouveau rôle</label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger className="h-10" data-testid="new-role-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => (
                      <SelectItem 
                        key={r} 
                        value={r} 
                        className="capitalize"
                        disabled={!isSuperAdmin && (r === 'admin' || r === 'manager')}
                      >
                        {r}
                        {!isSuperAdmin && (r === 'admin' || r === 'manager') && ' (Super Admin requis)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(newRole === 'admin' || newRole === 'manager') && editing.kyc_status !== 'approved' && (
                  <p className="text-xs text-orange-400 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    L'utilisateur devra compléter sa vérification KYC
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Annuler</Button>
                <Button className="flex-1 btn-primary-glow" onClick={handleUpdateUser} disabled={saving} data-testid="save-role-btn">
                  {saving ? 'Sauvegarde...' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Promotion Dialog */}
      {promotingUser && (
        <Dialog open={!!promotingUser} onOpenChange={() => setPromotingUser(null)}>
          <DialogContent className="bg-card border-border sm:max-w-md">
            <DialogHeader>
              <DialogTitle style={{fontFamily:'Manrope'}} className="flex items-center gap-2">
                <Crown size={18} className="text-yellow-500" />
                Promouvoir {promotingUser.name}
              </DialogTitle>
              <DialogDescription>
                Nommer cet utilisateur comme administrateur ou gestionnaire
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="bg-secondary/30 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User size={18} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{promotingUser.name}</p>
                    <p className="text-xs text-muted-foreground">{promotingUser.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Rôle actuel:</span>
                  <Badge className={roleColor[promotingUser.role]}>{promotingUser.role}</Badge>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Nouveau rôle</Label>
                <Select value={promotionRole} onValueChange={setPromotionRole}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={16} className="text-blue-400" />
                        <span>Gestionnaire (Manager)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <Crown size={16} className="text-primary" />
                        <span>Administrateur</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {promotingUser.kyc_status !== 'approved' && (
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                  <p className="text-sm text-orange-400 flex items-start gap-2">
                    <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>
                      Cet utilisateur n'a pas encore validé son KYC. Il devra compléter sa vérification d'identité après la promotion.
                    </span>
                  </p>
                </div>
              )}
            </div>
            <DialogFooter className="gap-3 sm:gap-0">
              <Button variant="outline" onClick={() => setPromotingUser(null)}>
                Annuler
              </Button>
              <Button 
                className="btn-primary-glow" 
                onClick={handlePromoteUser}
                disabled={promoting}
              >
                {promoting ? 'Promotion...' : 'Promouvoir'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* KYC Documents Dialog */}
      {viewingKyc && (
        <Dialog open={!!viewingKyc} onOpenChange={() => { setViewingKyc(null); setKycDocuments([]); setReviewNote(''); }}>
          <DialogContent className="bg-card border-border sm:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle style={{fontFamily:'Manrope'}}>Documents KYC - {viewingKyc.name}</DialogTitle>
              <DialogDescription>
                Téléphone: {viewingKyc.phone} • Statut: {KYC_STATUSES[viewingKyc.kyc_status] || viewingKyc.kyc_status}
                {viewingKyc.role !== 'client' && (
                  <Badge className={`ml-2 ${roleColor[viewingKyc.role]}`}>{viewingKyc.role}</Badge>
                )}
              </DialogDescription>
            </DialogHeader>
            
            {loadingKyc ? (
              <div className="py-8 text-center text-muted-foreground">Chargement des documents...</div>
            ) : (
              <div className="space-y-4 pt-2">
                {/* User Profile Image */}
                {viewingKyc.profile_image && (
                  <div className="bg-secondary/30 rounded-xl p-4">
                    <p className="text-sm font-medium text-foreground mb-2">Photo de profil</p>
                    <img 
                      src={`${backendUrl}${viewingKyc.profile_image}`}
                      alt="Profile"
                      className="w-24 h-24 rounded-full object-cover border-2 border-border cursor-pointer hover:border-primary transition-colors"
                      onClick={() => openImagePreview(`${backendUrl}${viewingKyc.profile_image}`, { document_type: 'profile', original_filename: 'Photo de profil' })}
                    />
                  </div>
                )}

                {/* KYC Documents */}
                <div>
                  <p className="text-sm font-medium text-foreground mb-3">Documents d'identité ({kycDocuments.length})</p>
                  {kycDocuments.length === 0 ? (
                    <div className="bg-secondary/20 rounded-xl p-6 text-center">
                      <FileText size={32} className="mx-auto text-muted-foreground/30 mb-2" />
                      <p className="text-muted-foreground text-sm">Aucun document soumis</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {kycDocuments.map((doc, idx) => (
                        <div 
                          key={doc.id || idx} 
                          className="bg-secondary/20 rounded-xl overflow-hidden border border-border hover:border-primary/50 transition-colors group"
                        >
                          <div 
                            className="relative aspect-[4/3] bg-black/20 cursor-pointer"
                            onClick={() => openImagePreview(`${backendUrl}${doc.file_path}`, doc)}
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
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <span className="bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full text-white text-sm flex items-center gap-1">
                                <ZoomIn size={14} /> Prévisualiser
                              </span>
                            </div>
                          </div>
                          <div className="p-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm text-foreground">
                                {DOC_TYPES[doc.document_type] || doc.document_type}
                              </p>
                              {doc.side && (
                                <Badge variant="outline" className="text-xs">
                                  {SIDE_LABELS[doc.side] || doc.side}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 truncate">{doc.original_filename}</p>
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
                </div>

                {/* Review Note & Actions for submitted status */}
                {viewingKyc.kyc_status === 'submitted' && (
                  <>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-2 block">Note de révision</label>
                      <Textarea 
                        value={reviewNote}
                        onChange={e => setReviewNote(e.target.value)}
                        placeholder="Ajoutez une note (optionnelle)..."
                        className="resize-none h-20"
                        data-testid="kyc-note-input"
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button 
                        variant="outline" 
                        className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                        onClick={() => handleKycAction(viewingKyc.id, 'reject')}
                        data-testid="reject-kyc-modal-btn"
                      >
                        <XCircle size={16} className="mr-2" /> Rejeter
                      </Button>
                      <Button 
                        className="flex-1 btn-primary-glow"
                        onClick={() => handleKycAction(viewingKyc.id, 'approve')}
                        data-testid="approve-kyc-modal-btn"
                      >
                        <CheckCircle2 size={16} className="mr-2" /> Approuver
                      </Button>
                    </div>
                  </>
                )}

                {/* Close button for non-submitted statuses */}
                {viewingKyc.kyc_status !== 'submitted' && (
                  <Button variant="outline" className="w-full" onClick={() => setViewingKyc(null)}>
                    Fermer
                  </Button>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Image Preview Modal */}
      <ImagePreviewModal 
        imageUrl={previewImage} 
        onClose={() => { setPreviewImage(null); setPreviewDocInfo(null); }}
        documentInfo={previewDocInfo}
      />
    </div>
  );
}
