import React, { useCallback, useEffect, useState } from 'react';
import API from '../utils/api';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useNavigate } from 'react-router-dom';
import { Send, Pencil } from 'lucide-react';

export function AssignmentRequestButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const r = await API.post('/admin/rbac/assignment-requests', { message });
      toast.success(r.data.message);
      setOpen(false);
      setMessage('');
    } catch (e) {
      toast.error(e.response?.data?.detail || "Impossible d'envoyer la demande");
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="assignment-request">
      <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
        <Send size={14} className="mr-2" /> Modification des attributions
      </Button>
      {open && (
        <div className="mt-3 space-y-2 max-w-md">
          <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Services souhaités (facultatif)" />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={send}>Envoyer aux administrateurs</Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AssignmentRequestsInbox() {
  const [items, setItems] = useState([]);
  const load = useCallback(() => {
    API.get('/admin/rbac/assignment-requests')
      .then((r) => setItems((r.data.received || []).filter((x) => x.status === 'pending')))
      .catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!items.length) return null;

  const navigate = useNavigate();

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2" data-testid="assignment-inbox">
      <p className="text-sm font-semibold">Demandes de modification des attributions</p>
      {items.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 text-sm border-t border-border pt-2">
          <div>
            <p>{r.requester_name} <span className="text-muted-foreground">({r.requester_email})</span></p>
            {r.message && <p className="text-xs text-muted-foreground">{r.message}</p>}
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate(`/admin/administrators?edit=${r.requester_id}`)}><Pencil size={14} className="mr-1" /> Modifier</Button>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Cliquez sur « Modifier » pour changer ses fonctions ou services (obligatoire), puis enregistrez la nouvelle sélection : la demande est alors validée.</p>
    </div>
  );
}
