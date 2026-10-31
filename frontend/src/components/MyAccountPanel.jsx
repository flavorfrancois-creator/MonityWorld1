import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import API from '../utils/api';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Camera, Lock, Mail, Phone, Trash2, User } from 'lucide-react';

const errMsg = (e, fallback) => e?.response?.data?.detail || fallback;
const imageUrl = (p) => (p ? (p.startsWith('http') ? p : `${process.env.REACT_APP_BACKEND_URL || ''}${p}`) : undefined);

function CodeStep({ label, onConfirm, onCancel, busy }) {
  const [code, setCode] = useState('');
  return (
    <div className="space-y-2 mt-3">
      <Label>{label}</Label>
      <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code à 6 chiffres" inputMode="numeric" />
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || code.length < 4} onClick={() => onConfirm(code)}>Confirmer</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Annuler</Button>
      </div>
    </div>
  );
}

// basics=true shows photo, name and password (admin page); clients already have these on their profile page.
export default function MyAccountPanel({ basics = true }) {
  const { user, refreshUser, logout } = useAuth();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [email, setEmail] = useState({ value: '', password: '', sent: false });
  const [phone, setPhone] = useState({ value: '', password: '', sent: false });
  const [del, setDel] = useState({ open: false, channel: 'email', password: '', sent: false });

  const run = async (fn, ok) => {
    setBusy(true);
    try { const r = await fn(); if (ok) toast.success(ok); return r; }
    catch (e) { toast.error(errMsg(e, 'Une erreur est survenue')); return null; }
    finally { setBusy(false); }
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const r = await run(() => API.post('/auth/upload-profile-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } }), 'Photo mise à jour');
    if (r) refreshUser && refreshUser();
  };

  const saveName = async () => {
    const r = await run(() => API.patch('/auth/profile', { name }), 'Profil mis à jour');
    if (r) refreshUser && refreshUser();
  };

  const changePassword = async () => {
    const r = await run(() => API.post('/auth/change-password', pw), 'Mot de passe modifié');
    if (r) setPw({ current_password: '', new_password: '' });
  };

  const requestEmail = async () => {
    const r = await run(() => API.post('/account/email/request', { new_email: email.value, password: email.password }), 'Code envoyé à la nouvelle adresse');
    if (r) setEmail({ ...email, sent: true });
  };
  const confirmEmail = async (code) => {
    const r = await run(() => API.post('/account/email/confirm', { code }), 'Adresse email mise à jour');
    if (r) { setEmail({ value: '', password: '', sent: false }); refreshUser && refreshUser(); }
  };

  const requestPhone = async () => {
    const r = await run(() => API.post('/account/phone/request', { new_phone: phone.value, password: phone.password }), 'Code envoyé au nouveau numéro');
    if (r) setPhone({ ...phone, sent: true });
  };
  const confirmPhone = async (code) => {
    const r = await run(() => API.post('/account/phone/confirm', { code }), 'Numéro mis à jour');
    if (r) { setPhone({ value: '', password: '', sent: false }); refreshUser && refreshUser(); }
  };

  const requestDelete = async () => {
    const r = await run(() => API.post('/account/delete/request', { channel: del.channel, password: del.password }), 'Code de confirmation envoyé');
    if (r) setDel({ ...del, sent: true });
  };
  const confirmDelete = async (code) => {
    const r = await run(() => API.post('/account/delete/confirm', { code, password: del.password }));
    if (r) {
      toast.success('Compte supprimé. Vous pouvez le restaurer pendant 6 mois depuis l’écran de connexion.');
      logout ? logout('/') : (localStorage.clear(), (window.location.href = '/'));
    }
  };

  return (
    <div className="space-y-6" data-testid="my-account-panel">
      {basics && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <User size={18} className="text-primary" />
              <div><CardTitle className="text-base">Profil</CardTitle><CardDescription className="text-xs">Photo et nom</CardDescription></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                <AvatarImage src={imageUrl(user?.profile_image)} />
                <AvatarFallback>{(user?.name || '?').slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadPhoto} />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}><Camera size={14} className="mr-2" />Changer la photo</Button>
            </div>
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
              <Button size="sm" onClick={saveName} disabled={busy || !name.trim() || name === user?.name}>Enregistrer</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {basics && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Lock size={18} className="text-primary" />
              <CardTitle className="text-base">Mot de passe</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input type="password" placeholder="Mot de passe actuel" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
            <Input type="password" placeholder="Nouveau mot de passe (6 caractères min.)" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
            <Button size="sm" onClick={changePassword} disabled={busy || !pw.current_password || pw.new_password.length < 6}>Changer le mot de passe</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Mail size={18} className="text-primary" />
            <div><CardTitle className="text-base">Adresse email</CardTitle><CardDescription className="text-xs">Actuelle : {user?.email || '—'}</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {!email.sent ? (
            <>
              <Input type="email" placeholder="Nouvelle adresse email" value={email.value} onChange={(e) => setEmail({ ...email, value: e.target.value })} />
              <Input type="password" placeholder="Mot de passe" value={email.password} onChange={(e) => setEmail({ ...email, password: e.target.value })} />
              <Button size="sm" onClick={requestEmail} disabled={busy || !email.value || !email.password}>Envoyer le code</Button>
            </>
          ) : (
            <CodeStep label="Code reçu sur la nouvelle adresse" busy={busy} onConfirm={confirmEmail} onCancel={() => setEmail({ value: '', password: '', sent: false })} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Phone size={18} className="text-primary" />
            <div><CardTitle className="text-base">Numéro de téléphone</CardTitle><CardDescription className="text-xs">Actuel : {user?.phone || '—'}</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {!phone.sent ? (
            <>
              <Input placeholder="+243..." value={phone.value} onChange={(e) => setPhone({ ...phone, value: e.target.value })} />
              <Input type="password" placeholder="Mot de passe" value={phone.password} onChange={(e) => setPhone({ ...phone, password: e.target.value })} />
              <Button size="sm" onClick={requestPhone} disabled={busy || !phone.value || !phone.password}>Envoyer le code</Button>
            </>
          ) : (
            <CodeStep label="Code reçu sur le nouveau numéro" busy={busy} onConfirm={confirmPhone} onCancel={() => setPhone({ value: '', password: '', sent: false })} />
          )}
        </CardContent>
      </Card>

      <Card className="border-red-300">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Trash2 size={18} className="text-red-600" />
            <div>
              <CardTitle className="text-base text-red-600">Supprimer mon compte</CardTitle>
              <CardDescription className="text-xs">Accès coupé immédiatement. Votre numéro et votre email ne pourront pas ouvrir de compte pendant 3 mois. Restauration possible pendant 6 mois sur votre demande.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!del.open ? (
            <Button variant="destructive" size="sm" onClick={() => setDel({ ...del, open: true })}>Supprimer mon compte</Button>
          ) : !del.sent ? (
            <div className="space-y-2">
              <Label>Recevoir le code de confirmation par</Label>
              <div className="flex gap-2">
                <Button size="sm" variant={del.channel === 'email' ? 'default' : 'outline'} onClick={() => setDel({ ...del, channel: 'email' })}>Email</Button>
                <Button size="sm" variant={del.channel === 'phone' ? 'default' : 'outline'} onClick={() => setDel({ ...del, channel: 'phone' })}>Téléphone</Button>
              </div>
              <Input type="password" placeholder="Mot de passe" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} />
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={requestDelete} disabled={busy || !del.password}>Envoyer le code</Button>
                <Button size="sm" variant="outline" onClick={() => setDel({ open: false, channel: 'email', password: '', sent: false })}>Annuler</Button>
              </div>
            </div>
          ) : (
            <CodeStep label="Code de confirmation" busy={busy} onConfirm={confirmDelete} onCancel={() => setDel({ open: false, channel: 'email', password: '', sent: false })} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
