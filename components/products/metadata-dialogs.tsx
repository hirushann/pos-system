'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createCategory,
  createBrand,
  createVehicleMake,
  createVehicleModel,
} from '@/src/actions/products';
import { toast } from 'sonner';
import { Loader2, Plus, Tag, ShieldCheck, Car, Layers } from 'lucide-react';

interface MetadataDialogsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: 'category' | 'brand' | 'make' | 'model';
  vehicleMakes: Array<{ id: number; name: string }>;
  onSuccess?: () => void;
}

export function MetadataDialogs({
  open,
  onOpenChange,
  initialTab = 'category',
  vehicleMakes,
  onSuccess,
}: MetadataDialogsProps) {
  const [activeTab, setActiveTab] = React.useState<'category' | 'brand' | 'make' | 'model'>(initialTab);
  const [prevTab, setPrevTab] = React.useState(initialTab);
  const [name, setName] = React.useState('');
  const [selectedMakeId, setSelectedMakeId] = React.useState<string>(
    vehicleMakes[0]?.id ? vehicleMakes[0].id.toString() : '',
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (prevTab !== initialTab) {
    setPrevTab(initialTab);
    setActiveTab(initialTab);
    setName('');
    setError(null);
  }

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setName('');
      setError(null);
    }
    onOpenChange(isOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (activeTab === 'category') {
        const res = await createCategory(name.trim());
        if (!res.success) {
          setError(res.error || 'Failed to create category');
          return;
        }
        toast.success(`Category "${name.trim()}" created successfully`);
      } else if (activeTab === 'brand') {
        const res = await createBrand(name.trim());
        if (!res.success) {
          setError(res.error || 'Failed to create brand');
          return;
        }
        toast.success(`Brand "${name.trim()}" created successfully`);
      } else if (activeTab === 'make') {
        const res = await createVehicleMake(name.trim());
        if (!res.success) {
          setError(res.error || 'Failed to create make');
          return;
        }
        toast.success(`Vehicle Make "${name.trim()}" created successfully`);
      } else if (activeTab === 'model') {
        const makeId = parseInt(selectedMakeId, 10);
        if (!makeId) {
          setError('Please select a vehicle make');
          setIsSubmitting(false);
          return;
        }
        const res = await createVehicleModel(makeId, name.trim());
        if (!res.success) {
          setError(res.error || 'Failed to create model');
          return;
        }
        toast.success(`Vehicle Model "${name.trim()}" created successfully`);
      }

      setName('');
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            <span>Manage Catalog Metadata</span>
          </DialogTitle>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setActiveTab('category');
              setError(null);
            }}
            className={`flex items-center justify-center gap-1 rounded-md py-1.5 transition-colors ${
              activeTab === 'category'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Tag className="h-3.5 w-3.5" />
            <span>Category</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('brand');
              setError(null);
            }}
            className={`flex items-center justify-center gap-1 rounded-md py-1.5 transition-colors ${
              activeTab === 'brand'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Brand</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('make');
              setError(null);
            }}
            className={`flex items-center justify-center gap-1 rounded-md py-1.5 transition-colors ${
              activeTab === 'make'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Car className="h-3.5 w-3.5" />
            <span>Make</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('model');
              setError(null);
            }}
            className={`flex items-center justify-center gap-1 rounded-md py-1.5 transition-colors ${
              activeTab === 'model'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Model</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          {activeTab === 'model' && (
            <div className="space-y-1.5">
              <Label htmlFor="meta-make">Vehicle Make</Label>
              <Select
                value={selectedMakeId}
                onValueChange={setSelectedMakeId}
              >
                <SelectTrigger id="meta-make" className="w-full">
                  <SelectValue placeholder="Select Make" />
                </SelectTrigger>
                <SelectContent>
                  {vehicleMakes.map((m) => (
                    <SelectItem key={m.id} value={m.id.toString()}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="meta-name">
              {activeTab === 'category' && 'Category Name'}
              {activeTab === 'brand' && 'Brand / Manufacturer Name'}
              {activeTab === 'make' && 'Vehicle Make (e.g. Toyota, Nissan)'}
              {activeTab === 'model' && 'Model Name (e.g. Corolla 141, Vezel)'}
            </Label>
            <Input
              id="meta-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                activeTab === 'category'
                  ? 'e.g. Braking System'
                  : activeTab === 'brand'
                  ? 'e.g. Toyota Genuine / Denso'
                  : activeTab === 'make'
                  ? 'e.g. Honda'
                  : 'e.g. Civic FD4'
              }
              autoFocus
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
