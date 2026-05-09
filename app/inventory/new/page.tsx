"use client";

/**
 * New product. Minimal create flow — capture name + price, then redirect to
 * the full edit page (form + builder tabs). Keeping this lean avoids the
 * "form is half full of empty defaults" smell.
 */

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateInventoryProductMutation } from "@/lib/api/inventory/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Boxes, Loader2 } from "lucide-react";
import { CURRENCY_OPTIONS } from "@/components/inventory/constants";
import { useToast } from "@/hooks/use-toast";

export default function NewInventoryProductPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [stockQty, setStockQty] = useState("0");
  const [createProduct, { isLoading }] = useCreateInventoryProductMutation();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (price === "" || Number(price) < 0) return;
    try {
      const r = await createProduct({
        name: name.trim(),
        sku: sku.trim() || null,
        price: Number(price) as any,
        currency,
        stockQty: Number(stockQty) || 0,
        status: "DRAFT" as any,
      }).unwrap();
      router.push(`/inventory/${r.data.id}`);
    } catch (err: any) {
      toast({
        title: "Could not create product",
        description: err?.data?.error ?? err?.message ?? "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-5">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
          <Link href="/inventory" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Boxes className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">New product</h1>
          <p className="text-xs text-muted-foreground">
            Quick start — fill in the rest on the next page.
          </p>
        </div>
      </div>

      <form onSubmit={submit}>
        <Card className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Name <span className="text-destructive">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aurora Wireless Earbuds" autoFocus />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">SKU</Label>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Price <span className="text-destructive">*</span></Label>
              <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Initial stock</Label>
              <Input type="number" min={0} value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button asChild variant="ghost" type="button">
              <Link href="/inventory">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim() || price === ""}>
              {isLoading && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Create & continue
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
