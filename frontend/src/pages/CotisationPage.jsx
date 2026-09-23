import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import API from '../utils/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Switch } from '../components/ui/switch';
import { 
  Users2, Plus, Copy, UserPlus, Calendar, DollarSign, Hash, MessageCircle, 
  Send, ArrowLeft, Coins, X, Search, Phone, Check, XCircle, Clock,
  Shield, Settings, UserMinus, ChevronRight, Bell, RefreshCw, 
  RotateCcw, Trophy, ArrowUpDown, Wallet, History, Play, GripVertical
} from 'lucide-react';

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', XAF: 'FCFA', XOF: 'FCFA', GBP: '£', CNY: '¥', CDF: 'FC', NGN: '₦', GHS: '₵', RUB: '₽', CAD: 'C$', MXN: '$' };

const FREQUENCY_LABELS = {
  daily: 'Journalière',
  weekly: 'Hebdomadaire',
  biweekly: 'Bi-hebdomadaire',
  monthly: 'Mensuelle',
  quarterly: 'Trimestrielle'
};

export default function CotisationPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [joinRequestsOpen, setJoinRequestsOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ 
    name: '', 
    description: '',
    contribution_amount: '', 
    currency: 'USD', 
    frequency: 'monthly', 
    max_members: '10',
    auto_debit: false
  });
  const [inviteCode, setInviteCode] = useState('');
  
  // Chat state
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupDetails, setGroupDetails] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [contributions, setContributions] = useState(null);
  const [showContribute, setShowContribute] = useState(false);
  const [contributeAmount, setContributeAmount] = useState('');
  const messagesEndRef = useRef(null);

  // Invite state
  const [recentContacts, setRecentContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [inviting, setInviting] = useState(false);

  // Pending invitations for user
  const [pendingInvitations, setPendingInvitations] = useState([]);

  // Join requests (admin)
  const [joinRequests, setJoinRequests] = useState([]);

  // Rotation system state
  const [rotationOpen, setRotationOpen] = useState(false);
  const [rotationData, setRotationData] = useState(null);
  const [payoutHistoryOpen, setPayoutHistoryOpen] = useState(false);
  const [payoutHistory, setPayoutHistory] = useState(null);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutNote, setPayoutNote] = useState('');
  const [payoutProcessing, setPayoutProcessing] = useState(false);
  const [rotationEditMode, setRotationEditMode] = useState(false);
  const [editedRotationOrder, setEditedRotationOrder] = useState([]);

  const fetchGroups = async () => {
    try {
      const res = await API.get('/groups');
      setGroups(res.data);
    } catch (e) { 
      toast.error('Erreur de chargement'); 
    } finally { 
      setLoading(false); 
    }
  };

  const fetchPendingInvitations = async () => {
    try {
      const res = await API.get('/groups/invitations/pending');
      setPendingInvitations(res.data.invitations || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { 
    fetchGroups(); 
    fetchPendingInvitations();
  }, []);

  const fetchMessages = useCallback(async (groupId) => {
    try {
      const res = await API.get(`/groups/${groupId}/messages`);
      setMessages(res.data.messages || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchContributions = useCallback(async (groupId) => {
    try {
      const res = await API.get(`/groups/${groupId}/contributions`);
      setContributions(res.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchGroupDetails = useCallback(async (groupId) => {
    try {
      const res = await API.get(`/groups/${groupId}`);
      setGroupDetails(res.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchJoinRequests = useCallback(async (groupId) => {
    try {
      const res = await API.get(`/groups/${groupId}/join-requests`);
      setJoinRequests(res.data.requests || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchRotationData = useCallback(async (groupId) => {
    try {
      const res = await API.get(`/groups/${groupId}/rotation`);
      setRotationData(res.data);
      setEditedRotationOrder(res.data.rotation_order?.map(r => r.user_id) || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchPayoutHistory = useCallback(async (groupId) => {
    try {
      const res = await API.get(`/groups/${groupId}/payout-history`);
      setPayoutHistory(res.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchRecentContacts = async () => {
    try {
      const res = await API.get('/contacts/recent');
      setRecentContacts(res.data.contacts || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (selectedGroup) {
      fetchMessages(selectedGroup.id);
      fetchContributions(selectedGroup.id);
      fetchGroupDetails(selectedGroup.id);
      fetchRotationData(selectedGroup.id);
      const interval = setInterval(() => fetchMessages(selectedGroup.id), 5000);
      return () => clearInterval(interval);
    }
  }, [selectedGroup, fetchMessages, fetchContributions, fetchGroupDetails, fetchRotationData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCreate = async () => {
    if (!form.name || !form.contribution_amount) { 
      toast.error('Remplissez tous les champs obligatoires'); 
      return; 
    }
    setCreating(true);
    try {
      await API.post('/groups', { 
        ...form, 
        contribution_amount: parseFloat(form.contribution_amount), 
        max_members: parseInt(form.max_members),
        auto_debit: form.auto_debit
      });
      toast.success('Groupe créé avec succès !');
      setCreateOpen(false);
      setForm({ name: '', description: '', contribution_amount: '', currency: 'USD', frequency: 'monthly', max_members: '10', auto_debit: false });
      fetchGroups();
    } catch (e) { 
      toast.error(e.response?.data?.detail || 'Erreur'); 
    } finally { 
      setCreating(false); 
    }
  };

  const handleJoinWithCode = async () => {
    if (!inviteCode) { 
      toast.error('Entrez un code d\'invitation'); 
      return; 
    }
    try {
      const res = await API.post('/groups/join/request', { invite_code: inviteCode });
      toast.success(res.data.message);
      setJoinOpen(false);
      setInviteCode('');
    } catch (e) { 
      toast.error(e.response?.data?.detail || 'Groupe non trouvé'); 
    }
  };

  const handleRespondToInvitation = async (groupId, action) => {
    try {
      const res = await API.post(`/groups/${groupId}/invitation/respond`, { action });
      toast.success(res.data.message);
      fetchPendingInvitations();
      if (action === 'accept') {
        fetchGroups();
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const handleSearchContacts = useCallback(async () => {
    if (searchQuery.length < 3) return;
    try {
      const res = await API.get(`/contacts/search?query=${searchQuery}`);
      setSearchResults(res.data.results || []);
    } catch (e) {
      console.error(e);
    }
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 3) {
        handleSearchContacts();
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, handleSearchContacts]);

  const toggleContactSelection = (contact) => {
    if (selectedContacts.find(c => c.id === contact.id)) {
      setSelectedContacts(selectedContacts.filter(c => c.id !== contact.id));
    } else {
      setSelectedContacts([...selectedContacts, contact]);
    }
  };

  const handleSendInvitations = async () => {
    if (selectedContacts.length === 0) {
      toast.error('Sélectionnez au moins un contact');
      return;
    }
    setInviting(true);
    try {
      const res = await API.post(`/groups/${selectedGroup.id}/invite`, {
        phone_numbers: selectedContacts.map(c => c.phone)
      });
      
      if (res.data.invited?.length > 0) {
        toast.success(`${res.data.invited.length} invitation(s) envoyée(s)`);
      }
      if (res.data.not_found?.length > 0) {
        toast.warning(`${res.data.not_found.length} contact(s) non trouvé(s)`);
      }
      
      setInviteOpen(false);
      setSelectedContacts([]);
      setSearchQuery('');
      fetchGroupDetails(selectedGroup.id);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur d\'envoi');
    } finally {
      setInviting(false);
    }
  };

  const handleJoinRequestResponse = async (userId, action) => {
    try {
      await API.post(`/groups/${selectedGroup.id}/join-requests/${userId}/respond?action=${action}`);
      toast.success(action === 'approve' ? 'Demande approuvée' : 'Demande refusée');
      fetchJoinRequests(selectedGroup.id);
      fetchGroupDetails(selectedGroup.id);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedGroup) return;
    try {
      await API.post(`/groups/${selectedGroup.id}/messages`, null, {
        params: { content: newMessage.trim() }
      });
      setNewMessage('');
      fetchMessages(selectedGroup.id);
    } catch (e) {
      toast.error('Erreur d\'envoi');
    }
  };

  const handleContribute = async () => {
    const amount = contributeAmount ? parseFloat(contributeAmount) : null;
    try {
      await API.post(`/groups/${selectedGroup.id}/contribute`, null, {
        params: amount ? { amount } : {}
      });
      toast.success('Contribution effectuée !');
      setShowContribute(false);
      setContributeAmount('');
      fetchContributions(selectedGroup.id);
      fetchMessages(selectedGroup.id);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const openGroup = (group) => {
    setSelectedGroup(group);
    setMessages([]);
    setContributions(null);
    setGroupDetails(null);
  };

  const openInviteModal = () => {
    setInviteOpen(true);
    fetchRecentContacts();
  };

  const openJoinRequestsModal = () => {
    setJoinRequestsOpen(true);
    fetchJoinRequests(selectedGroup.id);
  };

  const openRotationModal = () => {
    setRotationOpen(true);
    fetchRotationData(selectedGroup.id);
  };

  const openPayoutHistoryModal = () => {
    setPayoutHistoryOpen(true);
    fetchPayoutHistory(selectedGroup.id);
  };

  const handleSaveRotationOrder = async () => {
    try {
      await API.put(`/groups/${selectedGroup.id}/rotation`, {
        member_order: editedRotationOrder
      });
      toast.success('Ordre de rotation mis à jour');
      setRotationEditMode(false);
      fetchRotationData(selectedGroup.id);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur de mise à jour');
    }
  };

  const moveInRotation = (index, direction) => {
    const newOrder = [...editedRotationOrder];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    setEditedRotationOrder(newOrder);
  };

  const addToRotation = async (userId) => {
    try {
      await API.post(`/groups/${selectedGroup.id}/rotation/add?user_id=${userId}`);
      toast.success('Membre ajouté à la rotation');
      fetchRotationData(selectedGroup.id);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const removeFromRotation = async (userId) => {
    try {
      await API.delete(`/groups/${selectedGroup.id}/rotation/${userId}`);
      toast.success('Membre retiré de la rotation');
      fetchRotationData(selectedGroup.id);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const handleContributeCycle = async () => {
    const amount = contributeAmount ? parseFloat(contributeAmount) : null;
    try {
      const res = await API.post(`/groups/${selectedGroup.id}/contribute-cycle`, null, {
        params: amount ? { amount } : {}
      });
      toast.success(res.data.message);
      setShowContribute(false);
      setContributeAmount('');
      fetchContributions(selectedGroup.id);
      fetchRotationData(selectedGroup.id);
      fetchMessages(selectedGroup.id);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const handleExecutePayout = async () => {
    if (!rotationData?.current_beneficiary) return;
    setPayoutProcessing(true);
    try {
      const res = await API.post(`/groups/${selectedGroup.id}/payout`, {
        beneficiary_id: rotationData.current_beneficiary.user_id,
        note: payoutNote || null
      });
      toast.success(res.data.message);
      setPayoutOpen(false);
      setPayoutNote('');
      fetchRotationData(selectedGroup.id);
      fetchMessages(selectedGroup.id);
      if (res.data.cycle_complete) {
        toast.info(`Cycle terminé! Nouveau cycle #${res.data.new_cycle} démarré.`);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur de paiement');
    } finally {
      setPayoutProcessing(false);
    }
  };

  const handleStartNewCycle = async () => {
    try {
      const res = await API.post(`/groups/${selectedGroup.id}/new-cycle`);
      toast.success(res.data.message);
      fetchRotationData(selectedGroup.id);
      fetchMessages(selectedGroup.id);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const isGroupAdmin = groupDetails && (
    groupDetails.admins?.includes(user?.id) || 
    groupDetails.creator_id === user?.id
  );

  if (loading) return <div className="p-6 space-y-4">{[1,2].map(i => <div key={i} className="skeleton h-32 w-full rounded-xl" />)}</div>;

  // Chat View
  if (selectedGroup) {
    return (
      <div className="flex flex-col h-[calc(100vh-120px)] max-w-3xl mx-auto">
        {/* Chat Header */}
        <div className="p-4 border-b border-border bg-card flex items-center gap-3">
          <button onClick={() => setSelectedGroup(null)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h2 className="font-semibold text-foreground" style={{ fontFamily: 'Manrope' }}>{selectedGroup.name}</h2>
            <p className="text-xs text-muted-foreground">
              {groupDetails?.members_details?.length || selectedGroup.members?.length || 0} membres
              {selectedGroup.auto_debit && <span className="ml-2 text-primary">• Prélèvement auto</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={openInviteModal} data-testid="invite-btn">
              <UserPlus size={14} className="mr-1" />
              Inviter
            </Button>
            <Button size="sm" variant="outline" onClick={openRotationModal} data-testid="rotation-btn">
              <RotateCcw size={14} className="mr-1" />
              Rotation
            </Button>
            <Button size="sm" onClick={() => setShowContribute(true)} data-testid="contribute-btn">
              <Coins size={14} className="mr-1" />
              Cotiser
            </Button>
            {isGroupAdmin && (
              <Button size="sm" variant="ghost" onClick={openJoinRequestsModal} className="relative">
                <Settings size={16} />
                {joinRequests.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">
                    {joinRequests.length}
                  </span>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Stats Bar */}
        {contributions && (
          <div className="p-3 border-b border-border bg-secondary/30 flex items-center justify-between text-sm">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-muted-foreground">
                Total: <span className="text-primary font-semibold">{CURRENCY_SYMBOLS[contributions.currency]}{contributions.total?.toLocaleString()}</span>
              </span>
              <span className="text-muted-foreground">
                Cotisation: <span className="text-foreground">{CURRENCY_SYMBOLS[selectedGroup.currency]}{selectedGroup.contribution_amount}</span>
              </span>
              <span className="text-muted-foreground">
                Fréquence: <span className="text-foreground">{FREQUENCY_LABELS[selectedGroup.frequency]}</span>
              </span>
            </div>
            <div className="bg-secondary/50 rounded-lg px-2 py-1 flex items-center gap-2">
              <Hash size={12} className="text-muted-foreground" />
              <span className="text-xs font-mono text-foreground">{selectedGroup.invite_code}</span>
              <button 
                onClick={() => { navigator.clipboard.writeText(selectedGroup.invite_code); toast.success('Code copié !'); }}
                className="text-muted-foreground hover:text-primary"
              >
                <Copy size={12} />
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="group-messages">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <MessageCircle size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Aucun message. Soyez le premier !</p>
            </div>
          ) : (
            messages.map(msg => (
              <div 
                key={msg.id} 
                className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                  msg.type === 'contribution' || msg.type === 'member_joined' || msg.type === 'member_left'
                    ? 'bg-green-500/10 border border-green-500/20 text-green-400 text-center w-full'
                    : msg.sender_id === user?.id 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-secondary text-foreground'
                }`}>
                  {msg.type !== 'contribution' && msg.type !== 'member_joined' && msg.type !== 'member_left' && msg.sender_id !== user?.id && (
                    <p className="text-xs font-medium mb-1 opacity-70">{msg.sender_name}</p>
                  )}
                  <p className="text-sm">{msg.content}</p>
                  <p className="text-[10px] opacity-50 mt-1 text-right">
                    {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <div className="p-4 border-t border-border bg-card">
          <div className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Écrire un message..."
              className="flex-1"
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              data-testid="message-input"
            />
            <Button onClick={sendMessage} disabled={!newMessage.trim()} data-testid="send-message-btn">
              <Send size={16} />
            </Button>
          </div>
        </div>

        {/* Invite Modal */}
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogContent className="bg-card border-border sm:max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle style={{fontFamily:'Manrope'}}>Inviter des membres</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
              {/* Search */}
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher par nom ou téléphone..."
                  className="pl-9"
                  data-testid="invite-search"
                />
              </div>

              {/* Selected Contacts */}
              {selectedContacts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedContacts.map(contact => (
                    <span 
                      key={contact.id} 
                      className="bg-primary/10 text-primary text-xs px-2 py-1 rounded-full flex items-center gap-1"
                    >
                      {contact.name}
                      <button onClick={() => toggleContactSelection(contact)}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Contact List */}
              <div className="flex-1 overflow-y-auto space-y-2">
                {searchQuery.length >= 3 && searchResults.length > 0 ? (
                  <>
                    <p className="text-xs text-muted-foreground">Résultats de recherche</p>
                    {searchResults.map(contact => (
                      <button
                        key={contact.id}
                        onClick={() => toggleContactSelection(contact)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                          selectedContacts.find(c => c.id === contact.id)
                            ? 'bg-primary/10 border border-primary/30'
                            : 'bg-secondary/50 hover:bg-secondary'
                        }`}
                        data-testid={`contact-${contact.id}`}
                      >
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-foreground font-medium">
                          {contact.name.charAt(0)}
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-foreground">{contact.name}</p>
                          <p className="text-xs text-muted-foreground">{contact.phone}</p>
                        </div>
                        {selectedContacts.find(c => c.id === contact.id) && (
                          <Check size={16} className="text-primary" />
                        )}
                      </button>
                    ))}
                  </>
                ) : recentContacts.length > 0 ? (
                  <>
                    <p className="text-xs text-muted-foreground">Contacts récents</p>
                    {recentContacts.map(contact => (
                      <button
                        key={contact.id}
                        onClick={() => toggleContactSelection(contact)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                          selectedContacts.find(c => c.id === contact.id)
                            ? 'bg-primary/10 border border-primary/30'
                            : 'bg-secondary/50 hover:bg-secondary'
                        }`}
                        data-testid={`recent-contact-${contact.id}`}
                      >
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-foreground font-medium">
                          {contact.name.charAt(0)}
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-foreground">{contact.name}</p>
                          <p className="text-xs text-muted-foreground">{contact.phone}</p>
                        </div>
                        {selectedContacts.find(c => c.id === contact.id) && (
                          <Check size={16} className="text-primary" />
                        )}
                      </button>
                    ))}
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Phone size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Recherchez un contact par nom ou téléphone</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2 border-t border-border">
                <Button variant="outline" className="flex-1" onClick={() => setInviteOpen(false)}>
                  Annuler
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={handleSendInvitations} 
                  disabled={selectedContacts.length === 0 || inviting}
                  data-testid="send-invitations-btn"
                >
                  {inviting ? 'Envoi...' : `Inviter (${selectedContacts.length})`}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Join Requests Modal (Admin) */}
        <Dialog open={joinRequestsOpen} onOpenChange={setJoinRequestsOpen}>
          <DialogContent className="bg-card border-border sm:max-w-md">
            <DialogHeader>
              <DialogTitle style={{fontFamily:'Manrope'}}>Demandes d'adhésion</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {joinRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Aucune demande en attente</p>
                </div>
              ) : (
                joinRequests.map(request => (
                  <div key={request.id} className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
                    <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-foreground font-medium">
                      {request.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{request.name}</p>
                      <p className="text-xs text-muted-foreground">{request.phone}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-red-400 border-red-400/30 hover:bg-red-400/10"
                        onClick={() => handleJoinRequestResponse(request.id, 'reject')}
                      >
                        <XCircle size={14} />
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={() => handleJoinRequestResponse(request.id, 'approve')}
                      >
                        <Check size={14} />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Contribute Modal */}
        {showContribute && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm animate-fade-in-up">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Cotiser</h3>
                <button onClick={() => setShowContribute(false)} className="text-muted-foreground">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="bg-secondary/50 rounded-lg p-3 text-center">
                  <p className="text-sm text-muted-foreground">Montant {FREQUENCY_LABELS[selectedGroup.frequency].toLowerCase()}</p>
                  <p className="text-2xl font-bold text-primary">
                    {CURRENCY_SYMBOLS[selectedGroup.currency]}{selectedGroup.contribution_amount}
                  </p>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Ou montant personnalisé</Label>
                  <Input
                    type="number"
                    value={contributeAmount}
                    onChange={(e) => setContributeAmount(e.target.value)}
                    placeholder={`${selectedGroup.contribution_amount}`}
                    className="mt-1"
                    data-testid="contribute-amount"
                  />
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setShowContribute(false)}>
                    Annuler
                  </Button>
                  <Button className="flex-1" onClick={handleContributeCycle} data-testid="confirm-contribute">
                    Cotiser
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rotation Modal */}
        <Dialog open={rotationOpen} onOpenChange={setRotationOpen}>
          <DialogContent className="bg-card border-border sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle style={{fontFamily:'Manrope'}} className="flex items-center gap-2">
                <RotateCcw size={18} className="text-primary" />
                Ordre de Rotation
              </DialogTitle>
            </DialogHeader>
            
            {rotationData && (
              <div className="space-y-4 flex-1 overflow-y-auto">
                {/* Current Cycle Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-primary/10 border border-primary/20 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground">Cycle actuel</p>
                    <p className="text-xl font-bold text-primary">#{rotationData.current_cycle}</p>
                  </div>
                  <div className="bg-secondary/50 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground">Pot actuel</p>
                    <p className="text-xl font-bold text-foreground">
                      {CURRENCY_SYMBOLS[rotationData.currency]}{rotationData.current_pot?.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      / {CURRENCY_SYMBOLS[rotationData.currency]}{rotationData.expected_pot?.toLocaleString()} attendu
                    </p>
                  </div>
                </div>

                {/* Current Beneficiary */}
                {rotationData.current_beneficiary && (
                  <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                        <Trophy size={20} className="text-green-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-green-400">Bénéficiaire actuel (Position {rotationData.current_beneficiary.position})</p>
                        <p className="font-semibold text-foreground">{rotationData.current_beneficiary.name}</p>
                        <p className="text-xs text-muted-foreground">{rotationData.current_beneficiary.phone}</p>
                      </div>
                      {isGroupAdmin && rotationData.current_pot > 0 && (
                        <Button size="sm" onClick={() => setPayoutOpen(true)} data-testid="payout-btn">
                          <Wallet size={14} className="mr-1" />
                          Payer
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Rotation List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">Ordre de rotation</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={openPayoutHistoryModal}>
                        <History size={14} className="mr-1" />
                        Historique
                      </Button>
                      {isGroupAdmin && !rotationEditMode && (
                        <Button size="sm" variant="outline" onClick={() => {
                          setRotationEditMode(true);
                          setEditedRotationOrder(rotationData.rotation_order?.map(r => r.user_id) || []);
                        }}>
                          <ArrowUpDown size={14} className="mr-1" />
                          Modifier
                        </Button>
                      )}
                    </div>
                  </div>

                  {rotationData.rotation_order?.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground bg-secondary/30 rounded-xl">
                      <RotateCcw size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Aucun ordre de rotation défini</p>
                      {isGroupAdmin && (
                        <Button size="sm" variant="outline" className="mt-3" onClick={() => {
                          const allMembers = groupDetails?.members_details?.map(m => m.id) || [];
                          setEditedRotationOrder(allMembers);
                          setRotationEditMode(true);
                        }}>
                          Définir l'ordre
                        </Button>
                      )}
                    </div>
                  ) : rotationEditMode ? (
                    <div className="space-y-2">
                      {editedRotationOrder.map((userId, idx) => {
                        const member = groupDetails?.members_details?.find(m => m.id === userId);
                        return (
                          <div key={userId} className="flex items-center gap-2 p-3 bg-secondary/50 rounded-lg">
                            <GripVertical size={16} className="text-muted-foreground" />
                            <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-medium">
                              {idx + 1}
                            </span>
                            <span className="flex-1 text-sm text-foreground">{member?.name || userId}</span>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" disabled={idx === 0} onClick={() => moveInRotation(idx, 'up')}>
                                ↑
                              </Button>
                              <Button size="sm" variant="ghost" disabled={idx === editedRotationOrder.length - 1} onClick={() => moveInRotation(idx, 'down')}>
                                ↓
                              </Button>
                              <Button size="sm" variant="ghost" className="text-red-400" onClick={() => {
                                setEditedRotationOrder(editedRotationOrder.filter(id => id !== userId));
                              }}>
                                <X size={14} />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" className="flex-1" onClick={() => setRotationEditMode(false)}>
                          Annuler
                        </Button>
                        <Button className="flex-1" onClick={handleSaveRotationOrder}>
                          Enregistrer
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {rotationData.rotation_order?.map((member, idx) => (
                        <div 
                          key={member.user_id} 
                          className={`flex items-center gap-3 p-3 rounded-lg ${
                            member.is_current_beneficiary 
                              ? 'bg-green-500/10 border border-green-500/20' 
                              : member.has_received 
                                ? 'bg-secondary/30 opacity-60' 
                                : 'bg-secondary/50'
                          }`}
                        >
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            member.is_current_beneficiary 
                              ? 'bg-green-500 text-white' 
                              : member.has_received 
                                ? 'bg-muted-foreground/30 text-muted-foreground' 
                                : 'bg-primary/20 text-primary'
                          }`}>
                            {member.has_received ? '✓' : member.position}
                          </span>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">{member.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Cotisé: {CURRENCY_SYMBOLS[rotationData.currency]}{member.cycle_contribution || 0}
                              {member.cycle_contribution >= member.expected_contribution && (
                                <span className="ml-1 text-green-400">✓</span>
                              )}
                            </p>
                          </div>
                          {member.is_current_beneficiary && (
                            <Trophy size={16} className="text-green-400" />
                          )}
                          {member.has_received && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-muted-foreground/20 text-muted-foreground">
                              Reçu
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add members not in rotation */}
                  {isGroupAdmin && rotationEditMode && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-2">Membres non dans la rotation:</p>
                      {groupDetails?.members_details?.filter(m => !editedRotationOrder.includes(m.id)).map(member => (
                        <Button 
                          key={member.id}
                          size="sm" 
                          variant="outline" 
                          className="mr-2 mb-2"
                          onClick={() => setEditedRotationOrder([...editedRotationOrder, member.id])}
                        >
                          <Plus size={12} className="mr-1" />
                          {member.name}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Payout Modal */}
        <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
          <DialogContent className="bg-card border-border sm:max-w-md">
            <DialogHeader>
              <DialogTitle style={{fontFamily:'Manrope'}} className="flex items-center gap-2">
                <Wallet size={18} className="text-primary" />
                Effectuer le paiement
              </DialogTitle>
            </DialogHeader>
            
            {rotationData?.current_beneficiary && (
              <div className="space-y-4">
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
                  <p className="text-xs text-green-400 mb-1">Bénéficiaire</p>
                  <p className="text-lg font-bold text-foreground">{rotationData.current_beneficiary.name}</p>
                  <p className="text-xs text-muted-foreground">{rotationData.current_beneficiary.phone}</p>
                </div>

                <div className="bg-secondary/50 rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Montant à payer</p>
                  <p className="text-2xl font-bold text-primary">
                    {CURRENCY_SYMBOLS[rotationData.currency]}{rotationData.current_pot?.toLocaleString()}
                  </p>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Note (optionnel)</Label>
                  <Input
                    value={payoutNote}
                    onChange={(e) => setPayoutNote(e.target.value)}
                    placeholder="Ex: Paiement mensuel février"
                    className="mt-1"
                  />
                </div>

                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-sm text-yellow-400">
                  ⚠️ Cette action va transférer {CURRENCY_SYMBOLS[rotationData.currency]}{rotationData.current_pot} 
                  vers le portefeuille de {rotationData.current_beneficiary.name} et passer au prochain bénéficiaire.
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setPayoutOpen(false)}>
                    Annuler
                  </Button>
                  <Button 
                    className="flex-1" 
                    onClick={handleExecutePayout}
                    disabled={payoutProcessing || rotationData.current_pot <= 0}
                    data-testid="confirm-payout-btn"
                  >
                    {payoutProcessing ? 'Traitement...' : 'Confirmer le paiement'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Payout History Modal */}
        <Dialog open={payoutHistoryOpen} onOpenChange={setPayoutHistoryOpen}>
          <DialogContent className="bg-card border-border sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle style={{fontFamily:'Manrope'}} className="flex items-center gap-2">
                <History size={18} className="text-primary" />
                Historique des paiements
              </DialogTitle>
            </DialogHeader>
            
            {payoutHistory && (
              <div className="space-y-4 flex-1 overflow-y-auto">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-primary/10 border border-primary/20 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground">Total payé</p>
                    <p className="text-xl font-bold text-primary">
                      {CURRENCY_SYMBOLS[payoutHistory.currency]}{payoutHistory.total_paid?.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-secondary/50 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground">Paiements effectués</p>
                    <p className="text-xl font-bold text-foreground">{payoutHistory.total_payouts}</p>
                  </div>
                </div>

                {payoutHistory.all_payouts?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <History size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Aucun paiement effectué</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {payoutHistory.all_payouts?.slice().reverse().map((payout, idx) => (
                      <div key={payout.id || idx} className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
                        <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                          <Wallet size={16} className="text-green-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{payout.beneficiary_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Cycle {payout.cycle} • Position {payout.position}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-green-400">
                            +{CURRENCY_SYMBOLS[payout.currency]}{payout.amount?.toLocaleString()}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(payout.paid_at).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between animate-fade-in-up">
        <h2 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>Cotisation (Tontine)</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setJoinOpen(true)} data-testid="join-group-btn">
            <UserPlus size={14} className="mr-1" /> Rejoindre
          </Button>
          <Button size="sm" className="btn-primary-glow" onClick={() => setCreateOpen(true)} data-testid="create-group-btn">
            <Plus size={14} className="mr-1" /> Créer
          </Button>
        </div>
      </div>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <div className="space-y-3 animate-fade-in-up">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Bell size={14} className="text-primary" />
            Invitations en attente ({pendingInvitations.length})
          </h3>
          {pendingInvitations.map(inv => (
            <div key={inv.id} className="bg-primary/5 border border-primary/20 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">{inv.data?.group_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Invité par {inv.data?.inviter_name} • {CURRENCY_SYMBOLS[inv.data?.currency]}{inv.data?.contribution_amount}/{FREQUENCY_LABELS[inv.data?.frequency]?.toLowerCase()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleRespondToInvitation(inv.data?.group_id, 'reject')}
                    data-testid={`reject-invitation-${inv.id}`}
                  >
                    Refuser
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={() => handleRespondToInvitation(inv.data?.group_id, 'accept')}
                    data-testid={`accept-invitation-${inv.id}`}
                  >
                    Accepter
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {groups.length === 0 && pendingInvitations.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-12 text-center animate-fade-in-up">
          <Users2 size={40} className="text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-foreground font-medium mb-1">Aucun groupe</p>
          <p className="text-muted-foreground text-sm mb-4">Créez ou rejoignez un groupe de cotisation</p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => setJoinOpen(true)}>Rejoindre</Button>
            <Button className="btn-primary-glow" onClick={() => setCreateOpen(true)}>Créer un groupe</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in-up stagger-1">
          {groups.map(g => (
            <div key={g.id} className="bg-card border border-border rounded-xl p-5 cursor-pointer hover:border-primary/30 transition-colors" 
              onClick={() => openGroup(g)} data-testid={`group-${g.id}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-foreground" style={{fontFamily:'Manrope'}}>{g.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Créé par {g.creator_name}
                    {g.auto_debit && <span className="ml-2 text-primary">• Auto</span>}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full badge-completed">{g.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <DollarSign size={13} className="text-primary" />
                  <span>{g.contribution_amount} {g.currency}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar size={13} className="text-blue-400" />
                  <span>{FREQUENCY_LABELS[g.frequency] || g.frequency}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Users2 size={13} className="text-green-400" />
                  <span>{g.members?.length || 0}/{g.max_members} membres</span>
                </div>
                {g.auto_debit && (
                  <div className="flex items-center gap-1.5 text-primary">
                    <RefreshCw size={13} />
                    <span>Prélèvement auto</span>
                  </div>
                )}
              </div>
              {/* Progress bar */}
              <div className="w-full bg-secondary rounded-full h-1.5 mb-3">
                <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${((g.members?.length || 0) / g.max_members) * 100}%` }} />
              </div>
              {/* Footer */}
              <div className="flex items-center justify-between">
                <div className="bg-secondary/30 rounded-lg px-2 py-1 flex items-center gap-2">
                  <Hash size={12} className="text-muted-foreground" />
                  <span className="text-xs font-mono text-foreground">{g.invite_code}</span>
                  <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(g.invite_code); toast.success('Code copié !'); }}
                    className="text-muted-foreground hover:text-primary transition-colors" data-testid={`copy-invite-${g.id}`}>
                    <Copy size={13} />
                  </button>
                </div>
                <div className="flex items-center gap-1 text-primary text-xs">
                  <ChevronRight size={14} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader><DialogTitle style={{fontFamily:'Manrope'}}>Créer un groupe de cotisation</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Nom du groupe *</Label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ex: Famille Mutombo" className="h-11" data-testid="group-name-input" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Ex: Épargne pour les fêtes" className="h-11" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Cotisation *</Label>
                <Input type="number" value={form.contribution_amount} onChange={e => setForm({...form, contribution_amount: e.target.value})} placeholder="50" className="h-11" data-testid="group-amount-input" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Devise</Label>
                <Select value={form.currency} onValueChange={v => setForm({...form, currency: v})}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{['USD','EUR','XAF','XOF','CDF'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Fréquence</Label>
                <Select value={form.frequency} onValueChange={v => setForm({...form, frequency: v})}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Journalière</SelectItem>
                    <SelectItem value="weekly">Hebdomadaire</SelectItem>
                    <SelectItem value="biweekly">Bi-hebdomadaire (2 sem.)</SelectItem>
                    <SelectItem value="monthly">Mensuelle</SelectItem>
                    <SelectItem value="quarterly">Trimestrielle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Max membres</Label>
                <Select value={form.max_members} onValueChange={v => setForm({...form, max_members: v})}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{[5,10,15,20,30,50].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
              <div>
                <Label className="text-sm text-foreground">Prélèvement automatique</Label>
                <p className="text-xs text-muted-foreground">Débiter automatiquement le compte principal</p>
              </div>
              <Switch 
                checked={form.auto_debit} 
                onCheckedChange={(checked) => setForm({...form, auto_debit: checked})}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>Annuler</Button>
              <Button className="flex-1 btn-primary-glow" onClick={handleCreate} disabled={creating} data-testid="group-create-submit-btn">
                {creating ? 'Création...' : 'Créer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Join Dialog */}
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="bg-card border-border sm:max-w-sm">
          <DialogHeader><DialogTitle style={{fontFamily:'Manrope'}}>Rejoindre un groupe</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-secondary/30 rounded-lg p-3 text-sm text-muted-foreground">
              <p>Entrez le code d'invitation du groupe. L'administrateur devra approuver votre demande.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Code d'invitation</Label>
              <Input value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} placeholder="EX: AB12CD34" className="h-11 font-mono tracking-widest text-center text-lg" data-testid="join-code-input" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setJoinOpen(false)}>Annuler</Button>
              <Button className="flex-1 btn-primary-glow" onClick={handleJoinWithCode} data-testid="join-submit-btn">Demander à rejoindre</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
