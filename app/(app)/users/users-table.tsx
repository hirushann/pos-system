'use client';

import * as React from 'react';
import {
  UserPlus,
  KeyRound,
  Shield,
  ShieldAlert,
  MoreVertical,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  Search,
  UserX,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  createCashierAction,
  toggleUserStatusAction,
  resetPasswordAction,
} from './actions';

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  createdAt: string;
}

interface UsersTableProps {
  users: StaffUser[];
  currentUserId: string;
}

function generateRandomPassword(length = 12): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
  let pwd = '';
  for (let i = 0; i < length; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

export function UsersTable({ users, currentUserId }: UsersTableProps) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [isResetOpen, setIsResetOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<StaffUser | null>(null);

  // Add Cashier Form state
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // Reset Password Form state
  const [newPassword, setNewPassword] = React.useState('');
  const [isResetting, setIsResetting] = React.useState(false);

  // Action status loading states by userId
  const [loadingUserId, setLoadingUserId] = React.useState<string | null>(null);

  const filteredUsers = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        (u.role && u.role.toLowerCase().includes(term)),
    );
  }, [users, searchTerm]);

  const handleOpenAdd = () => {
    setName('');
    setEmail('');
    setPassword(generateRandomPassword(12));
    setCopied(false);
    setIsAddOpen(true);
  };

  const handleCreateCashier = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await createCashierAction({
        name: name.trim(),
        email: email.trim(),
        password,
      });

      if (!res.success) {
        toast.error(res.error || 'Failed to create cashier');
        setIsSubmitting(false);
        return;
      }

      toast.success(`Cashier ${name} created successfully!`);
      setIsAddOpen(false);
    } catch {
      toast.error('An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: StaffUser) => {
    if (user.id === currentUserId) {
      toast.error('You cannot deactivate your own account.');
      return;
    }

    const newBannedState = !user.banned;
    setLoadingUserId(user.id);

    try {
      const res = await toggleUserStatusAction({
        userId: user.id,
        banned: newBannedState,
      });

      if (!res.success) {
        toast.error(res.error || 'Failed to update status.');
        return;
      }

      toast.success(
        newBannedState
          ? `Account for ${user.name} has been deactivated.`
          : `Account for ${user.name} has been reactivated.`,
      );
    } catch {
      toast.error('An error occurred updating user status.');
    } finally {
      setLoadingUserId(null);
    }
  };

  const handleOpenReset = (user: StaffUser) => {
    setSelectedUser(user);
    setNewPassword(generateRandomPassword(12));
    setIsResetOpen(true);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setIsResetting(true);

    try {
      const res = await resetPasswordAction({
        userId: selectedUser.id,
        newPassword,
      });

      if (!res.success) {
        toast.error(res.error || 'Failed to reset password');
        setIsResetting(false);
        return;
      }

      toast.success(`Password for ${selectedUser.name} reset successfully!`);
      setIsResetOpen(false);
    } catch {
      toast.error('Failed to reset password.');
    } finally {
      setIsResetting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Password copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Table controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search staff by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Button onClick={handleOpenAdd} className="gap-2 shrink-0">
          <UserPlus className="h-4 w-4" />
          <span>Add Cashier</span>
        </Button>
      </div>

      {/* Staff Table */}
      <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Added On</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No staff accounts found.
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => {
                const isSelf = user.id === currentUserId;
                const isOwner = user.role === 'owner';
                const isBanned = Boolean(user.banned);

                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm">
                          {user.name} {isSelf && <span className="text-xs text-muted-foreground font-normal">(You)</span>}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">{user.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={isOwner ? 'default' : 'secondary'}
                        className="capitalize font-medium text-xs"
                      >
                        {user.role || 'cashier'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {isBanned ? (
                        <Badge variant="destructive" className="gap-1 text-xs">
                          <ShieldAlert className="h-3 w-3" />
                          <span>Deactivated</span>
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs"
                        >
                          <Shield className="h-3 w-3" />
                          <span>Active</span>
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {user.createdAt}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={loadingUserId === user.id}
                            className="h-8 w-8"
                          >
                            {loadingUserId === user.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreVertical className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel className="text-xs">Staff Actions</DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => handleOpenReset(user)}
                            className="gap-2 cursor-pointer"
                          >
                            <KeyRound className="h-4 w-4" />
                            <span>Reset Password</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {isBanned ? (
                            <DropdownMenuItem
                              onClick={() => handleToggleStatus(user)}
                              className="gap-2 text-emerald-600 dark:text-emerald-400 cursor-pointer"
                            >
                              <UserCheck className="h-4 w-4" />
                              <span>Reactivate Account</span>
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => handleToggleStatus(user)}
                              disabled={isSelf}
                              className="gap-2 text-destructive cursor-pointer disabled:opacity-50"
                            >
                              <UserX className="h-4 w-4" />
                              <span>Deactivate Account</span>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Cashier Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Cashier</DialogTitle>
            <DialogDescription>
              Create a staff account for a cashier. They will use these credentials to log in.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateCashier} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Full Name
              </label>
              <Input
                required
                placeholder="e.g. Kasun Fernando"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email Address
              </label>
              <Input
                type="email"
                required
                placeholder="e.g. kasun@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Temporary Password
                </label>
                <button
                  type="button"
                  onClick={() => setPassword(generateRandomPassword(12))}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Regenerate</span>
                </button>
              </div>
              <div className="flex gap-2">
                <Input
                  required
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(password)}
                  title="Copy password"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Share this password with the cashier.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span>Creating...</span>
                  </>
                ) : (
                  'Create Cashier'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new temporary password for {selectedUser?.name}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  New Password
                </label>
                <button
                  type="button"
                  onClick={() => setNewPassword(generateRandomPassword(12))}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Generate</span>
                </button>
              </div>
              <div className="flex gap-2">
                <Input
                  required
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(newPassword)}
                  title="Copy password"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsResetOpen(false)}
                disabled={isResetting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isResetting}>
                {isResetting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span>Updating...</span>
                  </>
                ) : (
                  'Update Password'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
