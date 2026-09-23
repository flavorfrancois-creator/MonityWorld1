import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import API from '../utils/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose
} from '../components/ui/dialog';
import { 
  User, Phone, Mail, Globe, Shield, Upload, CheckCircle2, Clock, XCircle, Edit3, Save, X, 
  Camera, Key, Eye, EyeOff, Lock, FileText, CreditCard, Trash2, AlertCircle, RefreshCw,
  MapPin, Briefcase, Calendar, Home, Building, AlertTriangle, MessageSquare
} from 'lucide-react';

const COUNTRIES = [
  { code: 'CD', name: 'RD Congo' }, { code: 'CM', name: 'Cameroun' },
  { code: 'SN', name: 'Sénégal' }, { code: 'CI', name: "Côte d'Ivoire" },
  { code: 'NG', name: 'Nigeria' }, { code: 'GH', name: 'Ghana' },
  { code: 'FR', name: 'France' }, { code: 'BE', name: 'Belgique' },
  { code: 'US', name: 'États-Unis' }, { code: 'GB', name: 'Royaume-Uni' },
  { code: 'CA', name: 'Canada' }, { code: 'MA', name: 'Maroc' },
  { code: 'MG', name: 'Madagascar' }, { code: 'TN', name: 'Tunisie' },
];

const LANGUAGES = [
  { code: 'fr', name: 'Français' }, { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' }, { code: 'zh', name: '中文' },
  { code: 'ru', name: 'Русский' }, { code: 'ln', name: 'Lingala' },
];

// KYC Document types configuration
const KYC_DOCUMENT_TYPES = {
  national_id: {
    name: "Carte d'identité nationale",
    icon: CreditCard,
    requires_front: true,
    requires_back: true,
    description: "Recto et verso de votre carte d'identité"
  },
  passport: {
    name: "Passeport",
    icon: FileText,
    requires_front: true,
    requires_back: false,
    description: "Page d'information de votre passeport"
  },
  voter_card: {
    name: "Carte d'électeur",
    icon: CreditCard,
    requires_front: true,
    requires_back: true,
    description: "Recto et verso de votre carte d'électeur"
  },
  driving_license: {
    name: "Permis de conduire",
    icon: CreditCard,
    requires_front: true,
    requires_back: true,
    description: "Recto et verso de votre permis de conduire"
  }
};

function KYCStatus({ status, reviewNote, discrepancies }) {
  const map = {
    pending: { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'En attente de soumission' },
    incomplete: { icon: AlertCircle, color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Documents incomplets' },
    submitted: { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'En cours de validation' },
    clarification_needed: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Clarification requise' },
    approved: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/10', label: 'Identité vérifiée' },
    rejected: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Rejeté - Soumettez à nouveau' },
  };
  const { icon: Icon, color, bg, label } = map[status] || map.pending;
  
  const pendingDiscrepancies = discrepancies?.filter(d => d.status === 'pending') || [];
  
  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${bg}`}>
        <Icon size={16} className={color} />
        <span className={`text-sm font-medium ${color}`}>{label}</span>
      </div>
      {status === 'rejected' && reviewNote && (
        <div className="px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/20">
          <p className="text-xs text-red-400">Motif: {reviewNote}</p>
        </div>
      )}
      {pendingDiscrepancies.length > 0 && (
        <div className="px-3 py-2 rounded-lg bg-orange-500/5 border border-orange-500/20 space-y-2">
          <p className="text-xs font-medium text-orange-400">Divergences à clarifier:</p>
          {pendingDiscrepancies.map(d => (
            <div key={d.id} className="text-xs text-orange-400/80">
              • {d.field_label}: {d.note || `Attendu: "${d.expected_value}", Trouvé: "${d.found_value}"`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentUploadCard({ side, sideLabel, document, onFileSelect, uploading, docType }) {
  const inputRef = useRef(null);
  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  
  return (
    <div className="border border-border rounded-xl p-4 bg-secondary/20">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-foreground">{sideLabel}</span>
        {document ? (
          <Badge variant="outline" className="text-green-400 border-green-400/30">
            <CheckCircle2 size={12} className="mr-1" />
            Téléversé
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">Requis</Badge>
        )}
      </div>
      
      {document ? (
        <div className="space-y-2">
          {document.content_type?.startsWith('image/') ? (
            <div className="relative aspect-video rounded-lg overflow-hidden bg-black/20">
              <img src={`${backendUrl}${document.file_path}`} alt={sideLabel} className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-secondary/30 rounded-lg">
              <FileText size={20} className="text-primary" />
              <span className="text-sm text-foreground truncate flex-1">{document.original_filename}</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Téléversé le {new Date(document.uploaded_at).toLocaleDateString('fr-FR')}
          </p>
        </div>
      ) : (
        <label className="cursor-pointer block">
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-muted-foreground">Téléversement...</span>
              </div>
            ) : (
              <>
                <Upload size={24} className="text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-foreground font-medium">Cliquez pour téléverser</p>
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP ou PDF (max 5 Mo)</p>
              </>
            )}
          </div>
          <input 
            ref={inputRef}
            type="file" 
            accept=".jpg,.jpeg,.png,.webp,.pdf" 
            className="hidden" 
            onChange={(e) => { const file = e.target.files?.[0]; if (file) onFileSelect(file, side); e.target.value = ''; }}
            disabled={uploading}
          />
        </label>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [docType, setDocType] = useState('national_id');
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [kycDocuments, setKycDocuments] = useState([]);
  const [kycStatus, setKycStatus] = useState(null);
  const [clearingDocs, setClearingDocs] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', country: '', language: '' });
  
  // Personal info form for KYC
  const [personalInfo, setPersonalInfo] = useState({
    last_name: '', first_name: '', date_of_birth: '', place_of_birth: '',
    occupation: '', residence_address: '', postal_box: '', postal_code: '', 
    street: '', city: '', country: ''
  });
  const [savingPersonalInfo, setSavingPersonalInfo] = useState(false);
  const [personalInfoSubmitted, setPersonalInfoSubmitted] = useState(false);
  const [editingPersonalInfo, setEditingPersonalInfo] = useState(false);
  const [discrepancies, setDiscrepancies] = useState([]);
  const [clarifyingDiscrepancy, setClarifyingDiscrepancy] = useState(null);
  const [clarificationText, setClarificationText] = useState('');
  
  // Password change
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false });
  const [changingPassword, setChangingPassword] = useState(false);
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (user) {
      setForm({ name: user.name || '', email: user.email || '', country: user.country || 'CD', language: user.language || 'fr' });
    }
  }, [user]);

  // Fetch KYC status and personal info
  useEffect(() => {
    const fetchKycStatus = async () => {
      try {
        const res = await API.get('/profile/kyc/status');
        setKycDocuments(res.data.documents || []);
        setKycStatus(res.data);
        setDiscrepancies(res.data.discrepancies || []);
        if (res.data.kyc_document_type) {
          setDocType(res.data.kyc_document_type);
        }
        // Set personal info if exists
        if (res.data.personal_info) {
          setPersonalInfo(res.data.personal_info);
          setPersonalInfoSubmitted(res.data.personal_info_submitted);
        }
      } catch (err) {
        console.error('Error fetching KYC status:', err);
      }
    };
    fetchKycStatus();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await API.patch('/auth/profile', form);
      await refreshUser();
      toast.success('Profil mis à jour !');
      setEditing(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur lors de la sauvegarde'); }
    finally { setSaving(false); }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Veuillez sélectionner une image'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('L\'image ne doit pas dépasser 5 Mo'); return; }
    
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await API.post('/auth/upload-profile-image', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      await refreshUser();
      toast.success('Photo de profil mise à jour !');
    } catch (err) { toast.error(err.response?.data?.detail || 'Erreur lors de l\'upload'); }
    finally { setUploadingPhoto(false); }
  };

  const handlePasswordChange = async () => {
    if (!passwordForm.current_password || !passwordForm.new_password) { toast.error('Veuillez remplir tous les champs'); return; }
    if (passwordForm.new_password !== passwordForm.confirm_password) { toast.error('Les mots de passe ne correspondent pas'); return; }
    if (passwordForm.new_password.length < 6) { toast.error('Le mot de passe doit contenir au moins 6 caractères'); return; }
    
    setChangingPassword(true);
    try {
      await API.post('/auth/change-password', { current_password: passwordForm.current_password, new_password: passwordForm.new_password });
      toast.success('Mot de passe modifié avec succès !');
      setShowPasswordDialog(false);
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) { toast.error(err.response?.data?.detail || 'Erreur lors du changement de mot de passe'); }
    finally { setChangingPassword(false); }
  };

  const handleSavePersonalInfo = async () => {
    // Validate required fields
    if (!personalInfo.last_name || !personalInfo.first_name || !personalInfo.date_of_birth || 
        !personalInfo.place_of_birth || !personalInfo.residence_address) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }
    
    setSavingPersonalInfo(true);
    try {
      await API.post('/profile/kyc/personal-info', personalInfo);
      toast.success('Informations personnelles enregistrées');
      setPersonalInfoSubmitted(true);
      setEditingPersonalInfo(false);
      // Refresh KYC status
      const res = await API.get('/profile/kyc/status');
      setKycStatus(res.data);
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur lors de l\'enregistrement'); }
    finally { setSavingPersonalInfo(false); }
  };

  const handleKycUpload = async (file, side) => {
    if (!file) return;
    const setUploading = side === 'front' ? setUploadingFront : setUploadingBack;
    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('document_type', docType);
      formData.append('side', side);
      formData.append('file', file);
      
      const res = await API.post('/profile/kyc', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(res.data.message);
      
      const statusRes = await API.get('/profile/kyc/status');
      setKycDocuments(statusRes.data.documents || []);
      setKycStatus(statusRes.data);
      await refreshUser();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur lors de l\'envoi'); }
    finally { setUploading(false); }
  };

  const handleClearDocuments = async () => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer tous vos documents KYC ?')) return;
    setClearingDocs(true);
    try {
      await API.delete('/profile/kyc/documents');
      toast.success('Documents supprimés');
      setKycDocuments([]);
      setKycStatus({ ...kycStatus, kyc_status: 'pending' });
      await refreshUser();
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur lors de la suppression'); }
    finally { setClearingDocs(false); }
  };

  const handleClarifyDiscrepancy = async () => {
    if (!clarificationText.trim()) { toast.error('Veuillez entrer une clarification'); return; }
    try {
      await API.post(`/profile/kyc/clarify?discrepancy_id=${clarifyingDiscrepancy.id}&clarification=${encodeURIComponent(clarificationText)}`);
      toast.success('Clarification envoyée');
      setClarifyingDiscrepancy(null);
      setClarificationText('');
      // Refresh
      const res = await API.get('/profile/kyc/status');
      setKycStatus(res.data);
      setDiscrepancies(res.data.discrepancies || []);
    } catch (e) { toast.error(e.response?.data?.detail || 'Erreur'); }
  };

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  const profileImageUrl = user?.profile_image ? `${process.env.REACT_APP_BACKEND_URL}${user.profile_image}` : null;

  const currentDocConfig = KYC_DOCUMENT_TYPES[docType];
  const frontDoc = kycDocuments.find(d => d.document_type === docType && d.side === 'front');
  const backDoc = kycDocuments.find(d => d.document_type === docType && d.side === 'back');
  const isDocComplete = frontDoc && (backDoc || !currentDocConfig?.requires_back);
  const canModifyKyc = user?.kyc_status !== 'approved';
  
  const pendingDiscrepancies = discrepancies.filter(d => d.status === 'pending');

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-2xl">
      <div className="animate-fade-in-up">
        <h2 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>Mon Profil</h2>
      </div>

      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />

      {/* Profile Header */}
      <div className="bg-card border border-border rounded-2xl p-6 animate-fade-in-up stagger-1">
        <div className="flex items-start gap-4 mb-4">
          <div className="relative group">
            <Avatar className="w-16 h-16">
              {profileImageUrl ? <AvatarImage src={profileImageUrl} alt={user?.name} /> : null}
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold" style={{fontFamily:'Manrope'}}>{initials}</AvatarFallback>
            </Avatar>
            <button onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}
              className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              {uploadingPhoto ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera size={20} className="text-white" />}
            </button>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-foreground" style={{fontFamily:'Manrope'}} data-testid="profile-name">{user?.name}</h3>
            <p className="text-sm text-muted-foreground">{user?.phone}</p>
            {user?.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
          </div>
          <Button variant={editing ? "default" : "outline"} size="sm" onClick={() => editing ? handleSave() : setEditing(true)} disabled={saving} data-testid="edit-profile-btn">
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editing ? <><Save size={14} className="mr-1" />Sauvegarder</> : <><Edit3 size={14} className="mr-1" />Modifier</>}
          </Button>
        </div>

        {editing && (
          <div className="space-y-4 pt-4 border-t border-border">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Nom complet</Label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="pl-9" data-testid="profile-name-input" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Email</Label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} className="pl-9" data-testid="profile-email-input" />
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}><X size={14} className="mr-1" />Annuler</Button>
          </div>
        )}

        {!editing && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground"><Phone size={14} /><span>{user?.phone}</span></div>
            <div className="flex items-center gap-2 text-muted-foreground"><Globe size={14} /><span>{COUNTRIES.find(c => c.code === user?.country)?.name || 'Non défini'}</span></div>
            {user?.email && <div className="flex items-center gap-2 text-muted-foreground col-span-2"><Mail size={14} /><span>{user.email}</span></div>}
          </div>
        )}
      </div>

      {/* KYC Section */}
      <div className="bg-card border border-border rounded-2xl p-6 animate-fade-in-up stagger-2">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
            <Shield size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground" style={{fontFamily:'Manrope'}}>Vérification d'identité (KYC)</h3>
            <p className="text-xs text-muted-foreground">Requis pour toutes les fonctionnalités</p>
          </div>
          {canModifyKyc && kycDocuments.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearDocuments} disabled={clearingDocs} className="text-muted-foreground hover:text-destructive">
              {clearingDocs ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </Button>
          )}
        </div>

        <KYCStatus status={user?.kyc_status} reviewNote={kycStatus?.kyc_review_note} discrepancies={discrepancies} />

        {canModifyKyc && (
          <div className="mt-6 space-y-6">
            {/* Step 1: Personal Information */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">1</div>
                <h4 className="font-medium text-foreground">Informations personnelles</h4>
                {personalInfoSubmitted && !editingPersonalInfo && (
                  <Badge variant="outline" className="text-green-400 border-green-400/30 ml-auto">
                    <CheckCircle2 size={12} className="mr-1" /> Complété
                  </Badge>
                )}
              </div>

              {(!personalInfoSubmitted || editingPersonalInfo) ? (
                <div className="bg-secondary/20 rounded-xl p-4 space-y-4">
                  <p className="text-xs text-muted-foreground">Ces informations doivent correspondre à votre document d'identité.</p>
                  
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Nom *</Label>
                      <Input value={personalInfo.last_name} onChange={e => setPersonalInfo({...personalInfo, last_name: e.target.value})} placeholder="Ex: DUPONT" className="h-10" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Prénom *</Label>
                      <Input value={personalInfo.first_name} onChange={e => setPersonalInfo({...personalInfo, first_name: e.target.value})} placeholder="Ex: Jean" className="h-10" />
                    </div>
                  </div>
                  
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Date de naissance *</Label>
                      <Input type="date" value={personalInfo.date_of_birth} onChange={e => setPersonalInfo({...personalInfo, date_of_birth: e.target.value})} className="h-10" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Lieu de naissance *</Label>
                      <Input value={personalInfo.place_of_birth} onChange={e => setPersonalInfo({...personalInfo, place_of_birth: e.target.value})} placeholder="Ex: Kinshasa" className="h-10" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Emploi / Profession</Label>
                    <div className="relative">
                      <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input value={personalInfo.occupation} onChange={e => setPersonalInfo({...personalInfo, occupation: e.target.value})} placeholder="Ex: Commerçant" className="h-10 pl-9" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Adresse de résidence *</Label>
                    <div className="relative">
                      <Home size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input value={personalInfo.residence_address} onChange={e => setPersonalInfo({...personalInfo, residence_address: e.target.value})} placeholder="Ex: 123 Avenue de la Paix" className="h-10 pl-9" />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Rue</Label>
                      <Input value={personalInfo.street} onChange={e => setPersonalInfo({...personalInfo, street: e.target.value})} placeholder="Ex: Rue de la Liberté" className="h-10" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Ville</Label>
                      <div className="relative">
                        <Building size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input value={personalInfo.city} onChange={e => setPersonalInfo({...personalInfo, city: e.target.value})} placeholder="Ex: Kinshasa" className="h-10 pl-9" />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Code postal</Label>
                      <Input value={personalInfo.postal_code} onChange={e => setPersonalInfo({...personalInfo, postal_code: e.target.value})} placeholder="Ex: 00000" className="h-10" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Boîte postale</Label>
                      <Input value={personalInfo.postal_box} onChange={e => setPersonalInfo({...personalInfo, postal_box: e.target.value})} placeholder="Ex: BP 1234" className="h-10" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Pays</Label>
                      <Select value={personalInfo.country || user?.country || 'CD'} onValueChange={v => setPersonalInfo({...personalInfo, country: v})}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>{COUNTRIES.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {editingPersonalInfo && (
                      <Button variant="outline" onClick={() => setEditingPersonalInfo(false)}>Annuler</Button>
                    )}
                    <Button className="flex-1 btn-primary-glow" onClick={handleSavePersonalInfo} disabled={savingPersonalInfo}>
                      {savingPersonalInfo ? 'Enregistrement...' : 'Enregistrer les informations'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="bg-secondary/20 rounded-xl p-4">
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Nom complet:</span><span className="text-foreground">{personalInfo.last_name} {personalInfo.first_name}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Date de naissance:</span><span className="text-foreground">{personalInfo.date_of_birth}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Lieu de naissance:</span><span className="text-foreground">{personalInfo.place_of_birth}</span></div>
                    {personalInfo.occupation && <div className="flex justify-between"><span className="text-muted-foreground">Profession:</span><span className="text-foreground">{personalInfo.occupation}</span></div>}
                    <div className="flex justify-between"><span className="text-muted-foreground">Adresse:</span><span className="text-foreground text-right max-w-[60%]">{personalInfo.residence_address}</span></div>
                  </div>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setEditingPersonalInfo(true)}>
                    <Edit3 size={12} className="mr-1" /> Modifier
                  </Button>
                </div>
              )}
            </div>

            {/* Step 2: Document Upload */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold ${personalInfoSubmitted ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>2</div>
                <h4 className="font-medium text-foreground">Document d'identité</h4>
                {isDocComplete && <Badge variant="outline" className="text-green-400 border-green-400/30 ml-auto"><CheckCircle2 size={12} className="mr-1" /> Téléversé</Badge>}
              </div>

              {personalInfoSubmitted && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Type de document d'identité</Label>
                    <Select value={docType} onValueChange={setDocType} disabled={kycDocuments.length > 0 && user?.kyc_status === 'submitted'}>
                      <SelectTrigger className="h-12" data-testid="kyc-doc-type-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(KYC_DOCUMENT_TYPES).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-2"><config.icon size={16} /><span>{config.name}</span></div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {currentDocConfig && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <AlertCircle size={12} />{currentDocConfig.description}
                      </p>
                    )}
                  </div>

                  <div className={`grid gap-4 ${currentDocConfig?.requires_back ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
                    <DocumentUploadCard side="front" sideLabel={currentDocConfig?.requires_back ? "Recto (Face avant)" : "Document"} document={frontDoc} onFileSelect={handleKycUpload} uploading={uploadingFront} docType={docType} />
                    {currentDocConfig?.requires_back && (
                      <DocumentUploadCard side="back" sideLabel="Verso (Face arrière)" document={backDoc} onFileSelect={handleKycUpload} uploading={uploadingBack} docType={docType} />
                    )}
                  </div>

                  {kycDocuments.length > 0 && (
                    <div className={`p-3 rounded-lg ${isDocComplete ? 'bg-green-500/10 border border-green-500/20' : 'bg-orange-500/10 border border-orange-500/20'}`}>
                      <div className="flex items-center gap-2">
                        {isDocComplete ? (
                          <><CheckCircle2 size={16} className="text-green-400" /><span className="text-sm text-green-400">Documents complets - En attente de validation</span></>
                        ) : (
                          <><AlertCircle size={16} className="text-orange-400" /><span className="text-sm text-orange-400">{!frontDoc ? 'Veuillez téléverser le recto' : 'Veuillez téléverser le verso'}</span></>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!personalInfoSubmitted && (
                <div className="bg-secondary/20 rounded-xl p-4 text-center">
                  <p className="text-sm text-muted-foreground">Veuillez d'abord remplir vos informations personnelles</p>
                </div>
              )}
            </div>

            {/* Discrepancies to clarify */}
            {pendingDiscrepancies.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center font-bold">!</div>
                  <h4 className="font-medium text-foreground">Clarifications requises</h4>
                </div>
                <div className="space-y-3">
                  {pendingDiscrepancies.map(d => (
                    <div key={d.id} className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-foreground text-sm">{d.field_label}</p>
                          <p className="text-xs text-muted-foreground mt-1">{d.note || `Information déclarée: "${d.expected_value}" - Trouvé sur document: "${d.found_value}"`}</p>
                          <p className="text-xs text-muted-foreground">Signalé par: {d.reported_by_name}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => { setClarifyingDiscrepancy(d); setClarificationText(''); }}>
                          <MessageSquare size={14} className="mr-1" /> Clarifier
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Security Section */}
      <Card className="animate-fade-in-up stagger-3">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center"><Key size={18} className="text-primary" /></div>
            <div><CardTitle className="text-base">Sécurité</CardTitle><CardDescription className="text-xs">Gérez votre mot de passe</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => setShowPasswordDialog(true)} className="w-full" data-testid="change-password-btn">
            <Lock size={16} className="mr-2" />Changer le mot de passe
          </Button>
        </CardContent>
      </Card>

      {/* Password Change Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Changer le mot de passe</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Mot de passe actuel</Label>
              <div className="relative">
                <Input type={showPasswords.current ? "text" : "password"} value={passwordForm.current_password} onChange={(e) => setPasswordForm({...passwordForm, current_password: e.target.value})} placeholder="••••••••" />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPasswords({...showPasswords, current: !showPasswords.current})}>
                  {showPasswords.current ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nouveau mot de passe</Label>
              <div className="relative">
                <Input type={showPasswords.new ? "text" : "password"} value={passwordForm.new_password} onChange={(e) => setPasswordForm({...passwordForm, new_password: e.target.value})} placeholder="••••••••" />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPasswords({...showPasswords, new: !showPasswords.new})}>
                  {showPasswords.new ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Confirmer</Label>
              <div className="relative">
                <Input type={showPasswords.confirm ? "text" : "password"} value={passwordForm.confirm_password} onChange={(e) => setPasswordForm({...passwordForm, confirm_password: e.target.value})} placeholder="••••••••" />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPasswords({...showPasswords, confirm: !showPasswords.confirm})}>
                  {showPasswords.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
            <Button onClick={handlePasswordChange} disabled={changingPassword}>{changingPassword ? 'Modification...' : 'Modifier'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clarification Dialog */}
      <Dialog open={!!clarifyingDiscrepancy} onOpenChange={() => setClarifyingDiscrepancy(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Clarifier la divergence</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            {clarifyingDiscrepancy && (
              <>
                <div className="bg-secondary/30 rounded-lg p-3">
                  <p className="font-medium text-sm text-foreground">{clarifyingDiscrepancy.field_label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{clarifyingDiscrepancy.note || `Déclaré: "${clarifyingDiscrepancy.expected_value}" - Sur document: "${clarifyingDiscrepancy.found_value}"`}</p>
                </div>
                <div className="space-y-2">
                  <Label>Votre clarification</Label>
                  <Textarea value={clarificationText} onChange={e => setClarificationText(e.target.value)} placeholder="Expliquez la différence..." className="min-h-[100px]" />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
            <Button onClick={handleClarifyDiscrepancy}>Envoyer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
