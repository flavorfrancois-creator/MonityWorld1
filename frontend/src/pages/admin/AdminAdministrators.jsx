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
import { Checkbox } from '../../components/ui/checkbox';
import { 
  Search, ChevronLeft, ChevronRight, Plus, Shield, User, Users, 
  Settings, Lock, Unlock, Trash2, Edit, Eye, CheckCircle2, XCircle,
  Globe, Key, UserCog, Crown, AlertTriangle, Loader2, Phone, Mail,
  Calendar, MapPin, Building, Ban, RefreshCw
} from 'lucide-react';

const ROLE_ICONS = {
  primary_admin: Crown,
  secondary_primary_admin: Crown,
  admin: UserCog,
  manager: Users,
};

const ROLE_COLORS = {
  primary_admin: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  secondary_primary_admin: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  admin: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  manager: 'bg-green-500/10 text-green-400 border-green-500/20',
};

export default function AdminManagement() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [myPermissions, setMyPermissions] = useState(null);
  const [permissionsData, setPermissionsData] = useState(null);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [processing, setProcessing] = useState(false);
  const LIMIT = 20;

  // Fetch my permissions and available permissions
  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const [myPerms, allPerms] = await Promise.all([
          API.get('/admin/rbac/my-permissions'),
          API.get('/admin/rbac/permissions')
        ]);
        setMyPermissions(myPerms.data);
        setPermissionsData(allPerms.data);
      } catch (e) {
        console.error('Error fetching permissions:', e);
      }
    };
    fetchPermissions();
  }, []);

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/admin/administrators?page=${page}&limit=${LIMIT}`;
      if (roleFilter) url += `&role=${roleFilter}`;
      const res = await API.get(url);
      setAdmins(res.data.administrators || []);
      setTotal(res.data.total || 0);
    } catch (e) {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter]);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  const hasPermission = (perm) => {
    return myPermissions?.permissions?.includes(perm) || myPermissions?.is_original_primary;
  };

  const filteredAdmins = search
    ? admins.filter(a =>
        a.name?.toLowerCase().includes(search.toLowerCase()) ||
        a.phone?.includes(search) ||
        a.email?.toLowerCase().includes(search.toLowerCase())
      )
    : admins;

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h2 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>
            Gestion des Administrateurs
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {total} administrateur{total > 1 ? 's' : ''} • {myPermissions?.role_label}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {myPermissions?.is_original_primary && (
            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
              <Crown size={12} className="mr-1" /> Admin Principal
            </Badge>
          )}
          {hasPermission('admins.create') && (
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <Plus size={16} /> Nouvel Admin
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 animate-fade-in-up stagger-1">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par nom, téléphone..."
            className="pl-9 h-9 text-sm"
          />
        </div>
        <select
          value={roleFilter}
          onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-md bg-secondary border border-border text-sm text-foreground"
        >
          <option value="">Tous les rôles</option>
          <option value="primary_admin">Admin Principal</option>
          <option value="secondary_primary_admin">Admin Principal (Secondaire)</option>
          <option value="admin">Administrateur</option>
          <option value="manager">Gestionnaire</option>
        </select>
      </div>

      {/* Admins Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in-up stagger-2">
        {loading ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Loader2 className="animate-spin mx-auto mb-2" />
            Chargement...
          </div>
        ) : filteredAdmins.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <UserCog size={48} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Aucun administrateur trouvé</p>
          </div>
        ) : filteredAdmins.map(admin => {
          const RoleIcon = ROLE_ICONS[admin.role] || User;
          const roleColor = ROLE_COLORS[admin.role] || 'bg-secondary text-muted-foreground';
          
          return (
            <div
              key={admin.id}
              className={`bg-card border rounded-xl p-4 transition-all ${
                admin.is_suspended 
                  ? 'border-red-500/30 bg-red-500/5' 
                  : admin.role === 'primary_admin' 
                    ? 'border-yellow-500/30' 
                    : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${roleColor}`}>
                  <RoleIcon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-foreground truncate">{admin.name}</h3>
                    {admin.is_suspended && (
                      <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 text-xs">
                        Suspendu
                      </Badge>
                    )}
                  </div>
                  <Badge variant="outline" className={`${roleColor} text-xs mt-1`}>
                    {admin.role_label}
                    {admin.admin_level !== null && admin.admin_level > 0 && ` (${admin.admin_level})`}
                  </Badge>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Phone size={10} /> {admin.phone}
                </p>
                {admin.email && (
                  <p className="flex items-center gap-2 truncate">
                    <Mail size={10} /> {admin.email}
                  </p>
                )}
                {admin.assigned_countries?.length > 0 && (
                  <p className="flex items-center gap-2">
                    <Globe size={10} /> {admin.assigned_countries.join(', ')}
                  </p>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {admin.permissions?.length || 0} permissions
                </span>
                <div className="flex items-center gap-1">
                  {admin.can_be_edited && hasPermission('admins.edit') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => { setSelectedAdmin(admin); setShowPermissionsDialog(true); }}
                      title="Modifier les permissions"
                    >
                      <Key size={14} />
                    </Button>
                  )}
                  {admin.can_be_suspended && hasPermission('admins.suspend') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-7 w-7 ${admin.is_suspended ? 'text-green-400' : 'text-orange-400'}`}
                      onClick={() => { setSelectedAdmin(admin); setShowSuspendDialog(true); }}
                      title={admin.is_suspended ? 'Réactiver' : 'Suspendre'}
                    >
                      {admin.is_suspended ? <Unlock size={14} /> : <Lock size={14} />}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} sur {pages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pages, p+1))} disabled={page === pages}>
            <ChevronRight size={14} />
          </Button>
        </div>
      )}

      {/* Create Admin Dialog */}
      <CreateAdminDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        permissionsData={permissionsData}
        myPermissions={myPermissions}
        onSuccess={() => { setShowCreateDialog(false); fetchAdmins(); }}
      />

      {/* Edit Permissions Dialog */}
      <EditPermissionsDialog
        open={showPermissionsDialog}
        onClose={() => { setShowPermissionsDialog(false); setSelectedAdmin(null); }}
        admin={selectedAdmin}
        permissionsData={permissionsData}
        myPermissions={myPermissions}
        onSuccess={() => { setShowPermissionsDialog(false); setSelectedAdmin(null); fetchAdmins(); }}
      />

      {/* Suspend Dialog */}
      <SuspendDialog
        open={showSuspendDialog}
        onClose={() => { setShowSuspendDialog(false); setSelectedAdmin(null); }}
        admin={selectedAdmin}
        onSuccess={() => { setShowSuspendDialog(false); setSelectedAdmin(null); fetchAdmins(); }}
      />
    </div>
  );
}

// Create Admin Dialog Component
function CreateAdminDialog({ open, onClose, permissionsData, myPermissions, onSuccess }) {
  const [form, setForm] = useState({
    phone: '',
    name: '',
    email: '',
    password: '',
    date_of_birth: '',
    place_of_birth: '',
    role: 'admin',
    country: 'CD',
    assigned_countries: [],
    permissions: [],
    can_create_roles: [],
    can_suspend_roles: []
  });
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const [countries, setCountries] = useState([]);
  const [registrationStep, setRegistrationStep] = useState(1);
  const [verificationId, setVerificationId] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [verificationToken, setVerificationToken] = useState('');

  const availableRoles = myPermissions?.can_create_roles || [];
  const categories = permissionsData?.categories || {};

  useEffect(() => {
    if (open) {
      API.get('/countries/db').then(res => setCountries(res.data || [])).catch(() => toast.error('Impossible de charger les pays'));
    }
  }, [open]);

  const handleSubmit = async () => {
    setProcessing(true);
    try {
      if (registrationStep === 1) {
        if (!form.country || !form.phone || !form.email) {
          toast.error('Pays, numéro de téléphone et adresse mail sont obligatoires');
          return;
        }
        const result = await API.post('/admin/administrators/registration/start', {
          country: form.country, phone: form.phone, email: form.email
        });
        setVerificationId(result.data.verification_id);
        setRegistrationStep(2);
        toast.success('Deux codes OTP ont été envoyés');
        return;
      }
      if (registrationStep === 2) {
        const result = await API.post('/admin/administrators/registration/verify', {
          verification_id: verificationId, phone_otp: phoneOtp, email_otp: emailOtp
        });
        setVerificationToken(result.data.verification_token);
        setRegistrationStep(3);
        toast.success('Coordonnées confirmées');
        return;
      }
      if (!form.name || !form.date_of_birth || !form.place_of_birth || !form.password) {
        toast.error('Nom, date et lieu de naissance, et mot de passe sont obligatoires');
        return;
      }
      await API.post('/admin/administrators/registration/complete', {
        verification_token: verificationToken,
        name: form.name,
        date_of_birth: form.date_of_birth,
        place_of_birth: form.place_of_birth,
        password: form.password,
        role: form.role,
        assigned_countries: form.assigned_countries,
        permissions: form.permissions,
        can_create_roles: form.can_create_roles,
        can_suspend_roles: form.can_suspend_roles
      });
      toast.success('Administrateur créé avec succès');
      setForm({
        phone: '', name: '', email: '', password: '', date_of_birth: '', place_of_birth: '',
        role: 'admin', country: 'CD', assigned_countries: [],
        permissions: [], can_create_roles: [], can_suspend_roles: []
      });
      setRegistrationStep(1); setVerificationId(''); setPhoneOtp(''); setEmailOtp(''); setVerificationToken('');
      onSuccess();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur lors de la création');
    } finally {
      setProcessing(false);
    }
  };

  const togglePermission = (perm) => {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(perm)
        ? f.permissions.filter(p => p !== perm)
        : [...f.permissions, perm]
    }));
  };

  const toggleCountry = (country) => {
    setForm(f => ({
      ...f,
      assigned_countries: f.assigned_countries.includes(country)
        ? f.assigned_countries.filter(c => c !== country)
        : [...f.assigned_countries, country]
    }));
  };

  const toggleCreateRole = (role) => {
    setForm(f => ({
      ...f,
      can_create_roles: f.can_create_roles.includes(role)
        ? f.can_create_roles.filter(r => r !== role)
        : [...f.can_create_roles, role]
    }));
  };

  const toggleSuspendRole = (role) => {
    setForm(f => ({
      ...f,
      can_suspend_roles: f.can_suspend_roles.includes(role)
        ? f.can_suspend_roles.filter(r => r !== role)
        : [...f.can_suspend_roles, role]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog size={18} className="text-primary" />
            Nouvel Administrateur
          </DialogTitle>
          <DialogDescription>
            Créez un nouveau compte administrateur avec des permissions spécifiques
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="info">Informations</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="roles">Création/Suspension</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-4 mt-4">
            {registrationStep < 3 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Pays de résidence *</label>
                <select value={form.country} onChange={e => {
                  const country = countries.find(c => c.code === e.target.value);
                  setForm(f => ({ ...f, country: e.target.value, phone: country?.dial_code || '' }));
                }} className="w-full h-10 px-3 rounded-md bg-secondary border border-border text-foreground">
                  {countries.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Numéro de téléphone *</label>
                <Input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+243..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Adresse mail *</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="email@example.com"
                />
              </div>
            </div>
            )}
            {registrationStep === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Confirmez le code reçu par WhatsApp/SMS et celui reçu par email.</p>
                <Input value={phoneOtp} onChange={e => setPhoneOtp(e.target.value)} placeholder="OTP téléphone" />
                <Input value={emailOtp} onChange={e => setEmailOtp(e.target.value)} placeholder="OTP email" />
              </div>
            )}
            {registrationStep === 3 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><label className="text-sm font-medium">Nom complet *</label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Date de naissance *</label><Input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Lieu de naissance *</label><Input value={form.place_of_birth} onChange={e => setForm(f => ({ ...f, place_of_birth: e.target.value }))} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Mot de passe *</label><Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Rôle *</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full h-10 px-3 rounded-md bg-secondary border border-border text-foreground"
                >
                  {availableRoles.map(role => (
                    <option key={role} value={role}>
                      {permissionsData?.roles?.[role]?.label || role}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Pays</label>
                <select
                  value={form.country}
                  onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                  className="w-full h-10 px-3 rounded-md bg-secondary border border-border text-foreground"
                >
                  <option value="CD">RD Congo</option>
                  <option value="CG">Congo Brazzaville</option>
                  <option value="FR">France</option>
                  <option value="BE">Belgique</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Pays accessibles</label>
              <p className="text-xs text-muted-foreground mb-2">Laissez vide pour accès à tous les pays</p>
              <div className="flex flex-wrap gap-2">
                {['CD', 'CG', 'FR', 'BE', 'CM', 'SN', 'CI'].map(c => (
                  <Button
                    key={c}
                    variant="outline"
                    size="sm"
                    className={form.assigned_countries.includes(c) ? 'bg-primary/10 border-primary' : ''}
                    onClick={() => toggleCountry(c)}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            </div>
            )}
          </TabsContent>

          <TabsContent value="permissions" className="mt-4">
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
              {Object.entries(categories).map(([catName, catData]) => (
                <div key={catName} className="space-y-2">
                  <h4 className="font-medium text-sm text-foreground">{catName}</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {catData.permissions.map(perm => (
                      <label
                        key={perm}
                        className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg hover:bg-secondary/50"
                      >
                        <Checkbox
                          checked={form.permissions.includes(perm)}
                          onCheckedChange={() => togglePermission(perm)}
                        />
                        <span className="text-muted-foreground">
                          {catData.permission_labels[perm]}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="roles" className="space-y-4 mt-4">
            <div className="space-y-3">
              <div>
                <h4 className="font-medium text-sm text-foreground mb-2">Peut créer les rôles suivants</h4>
                <div className="flex flex-wrap gap-2">
                  {['admin', 'manager', 'client'].map(role => (
                    <Button
                      key={role}
                      variant="outline"
                      size="sm"
                      className={form.can_create_roles.includes(role) ? 'bg-green-500/10 border-green-500/30 text-green-400' : ''}
                      onClick={() => toggleCreateRole(role)}
                    >
                      {permissionsData?.roles?.[role]?.label || role}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium text-sm text-foreground mb-2">Peut suspendre les rôles suivants</h4>
                <div className="flex flex-wrap gap-2">
                  {['admin', 'manager', 'partner', 'client'].map(role => (
                    <Button
                      key={role}
                      variant="outline"
                      size="sm"
                      className={form.can_suspend_roles.includes(role) ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : ''}
                      onClick={() => toggleSuspendRole(role)}
                    >
                      {permissionsData?.roles?.[role]?.label || role}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <DialogClose asChild>
            <Button variant="outline">Annuler</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={processing}>
            {processing ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Plus size={14} className="mr-2" />}
            {registrationStep === 1 ? 'Envoyer les OTP' : registrationStep === 2 ? 'Confirmer les OTP' : 'Créer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Edit Permissions Dialog Component
function EditPermissionsDialog({ open, onClose, admin, permissionsData, myPermissions, onSuccess }) {
  const [form, setForm] = useState({
    permissions: [],
    assigned_countries: [],
    can_create_roles: [],
    can_suspend_roles: []
  });
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (admin) {
      setForm({
        permissions: admin.permissions || [],
        assigned_countries: admin.assigned_countries || [],
        can_create_roles: admin.can_create_roles || [],
        can_suspend_roles: admin.can_suspend_roles || []
      });
    }
  }, [admin]);

  const categories = permissionsData?.categories || {};

  const handleSubmit = async () => {
    setProcessing(true);
    try {
      await API.put(`/admin/administrators/${admin.id}/permissions`, form);
      toast.success('Permissions mises à jour');
      onSuccess();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setProcessing(false);
    }
  };

  const togglePermission = (perm) => {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(perm)
        ? f.permissions.filter(p => p !== perm)
        : [...f.permissions, perm]
    }));
  };

  const toggleCountry = (country) => {
    setForm(f => ({
      ...f,
      assigned_countries: f.assigned_countries.includes(country)
        ? f.assigned_countries.filter(c => c !== country)
        : [...f.assigned_countries, country]
    }));
  };

  if (!admin) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key size={18} className="text-primary" />
            Permissions de {admin.name}
          </DialogTitle>
          <DialogDescription>
            Modifiez les permissions et l'accès de cet administrateur
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Country Access */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Pays accessibles</label>
            <p className="text-xs text-muted-foreground mb-2">Laissez vide pour accès à tous les pays</p>
            <div className="flex flex-wrap gap-2">
              {['CD', 'CG', 'FR', 'BE', 'CM', 'SN', 'CI'].map(c => (
                <Button
                  key={c}
                  variant="outline"
                  size="sm"
                  className={form.assigned_countries.includes(c) ? 'bg-primary/10 border-primary' : ''}
                  onClick={() => toggleCountry(c)}
                >
                  {c}
                </Button>
              ))}
            </div>
          </div>

          {/* Permissions */}
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
            <label className="text-sm font-medium">Permissions</label>
            {Object.entries(categories).map(([catName, catData]) => (
              <div key={catName} className="space-y-2">
                <h4 className="font-medium text-xs text-muted-foreground">{catName}</h4>
                <div className="grid grid-cols-2 gap-1">
                  {catData.permissions.map(perm => (
                    <label
                      key={perm}
                      className="flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded hover:bg-secondary/50"
                    >
                      <Checkbox
                        checked={form.permissions.includes(perm)}
                        onCheckedChange={() => togglePermission(perm)}
                      />
                      <span className="text-muted-foreground truncate">
                        {catData.permission_labels[perm]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Role Creation/Suspension */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Peut créer</label>
              <div className="flex flex-wrap gap-1">
                {['admin', 'manager', 'client'].map(role => (
                  <Button
                    key={role}
                    variant="outline"
                    size="sm"
                    className={`text-xs ${form.can_create_roles.includes(role) ? 'bg-green-500/10 border-green-500/30 text-green-400' : ''}`}
                    onClick={() => setForm(f => ({
                      ...f,
                      can_create_roles: f.can_create_roles.includes(role)
                        ? f.can_create_roles.filter(r => r !== role)
                        : [...f.can_create_roles, role]
                    }))}
                  >
                    {permissionsData?.roles?.[role]?.label || role}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Peut suspendre</label>
              <div className="flex flex-wrap gap-1">
                {['admin', 'manager', 'client'].map(role => (
                  <Button
                    key={role}
                    variant="outline"
                    size="sm"
                    className={`text-xs ${form.can_suspend_roles.includes(role) ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : ''}`}
                    onClick={() => setForm(f => ({
                      ...f,
                      can_suspend_roles: f.can_suspend_roles.includes(role)
                        ? f.can_suspend_roles.filter(r => r !== role)
                        : [...f.can_suspend_roles, role]
                    }))}
                  >
                    {permissionsData?.roles?.[role]?.label || role}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <DialogClose asChild>
            <Button variant="outline">Annuler</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={processing}>
            {processing ? <Loader2 size={14} className="mr-2 animate-spin" /> : <CheckCircle2 size={14} className="mr-2" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Suspend Dialog Component
function SuspendDialog({ open, onClose, admin, onSuccess }) {
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleAction = async () => {
    setProcessing(true);
    try {
      if (admin.is_suspended) {
        await API.post(`/admin/administrators/${admin.id}/unsuspend`);
        toast.success('Compte réactivé');
      } else {
        await API.post(`/admin/administrators/${admin.id}/suspend`, { reason });
        toast.success('Compte suspendu');
      }
      setReason('');
      onSuccess();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setProcessing(false);
    }
  };

  if (!admin) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {admin.is_suspended ? (
              <>
                <Unlock size={18} className="text-green-400" />
                Réactiver le compte
              </>
            ) : (
              <>
                <Ban size={18} className="text-red-400" />
                Suspendre le compte
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {admin.is_suspended
              ? `Voulez-vous réactiver le compte de ${admin.name} ?`
              : `Êtes-vous sûr de vouloir suspendre ${admin.name} ?`
            }
          </DialogDescription>
        </DialogHeader>

        {!admin.is_suspended && (
          <div className="space-y-2 py-4">
            <label className="text-sm font-medium">Raison de la suspension</label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Entrez la raison..."
              className="resize-none h-20"
            />
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Annuler</Button>
          </DialogClose>
          <Button
            onClick={handleAction}
            disabled={processing}
            className={admin.is_suspended ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
          >
            {processing ? (
              <Loader2 size={14} className="mr-2 animate-spin" />
            ) : admin.is_suspended ? (
              <Unlock size={14} className="mr-2" />
            ) : (
              <Ban size={14} className="mr-2" />
            )}
            {admin.is_suspended ? 'Réactiver' : 'Suspendre'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
