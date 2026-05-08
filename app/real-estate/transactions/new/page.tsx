"use client";

/**
 * Create transaction. Pick a property (UNDER_CONTRACT or AVAILABLE) and the
 * agent(s); the back end auto-flips the property to UNDER_CONTRACT and
 * creates a PENDING transaction.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { useCreateTransactionMutation } from "@/lib/api/real-estate/transactions";
import { useGetPropertiesQuery } from "@/lib/api/real-estate/properties";
import { useGetAgentsQuery } from "@/lib/api/real-estate/agents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Receipt } from "lucide-react";
import { fullName, formatCurrency } from "@/components/real-estate/constants";

export default function NewTransactionPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [create, { isLoading }] = useCreateTransactionMutation();

  const { data: propertiesData } = useGetPropertiesQuery({
    status: "AVAILABLE",
    limit: 200,
  });
  const propertiesUnderContract = useGetPropertiesQuery({
    status: "UNDER_CONTRACT",
    limit: 200,
  });
  const { data: agentsData } = useGetAgentsQuery({ status: "ACTIVE", limit: 200 });

  const allProperties = [
    ...(propertiesData?.data ?? []),
    ...(propertiesUnderContract.data?.data ?? []),
  ];
  const agents = agentsData?.data ?? [];

  const [propertyId, setPropertyId] = useState("");
  const [listingAgentId, setListingAgentId] = useState("");
  const [sellingAgentId, setSellingAgentId] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [code, setCode] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");

  const property = allProperties.find((p) => p.id === propertyId);

  // Default sale price + listing agent when picking a property
  const onPickProperty = (id: string) => {
    setPropertyId(id);
    const p = allProperties.find((pp) => pp.id === id);
    if (p) {
      setListingAgentId(p.listingAgentId);
      if (!salePrice) setSalePrice(String(p.listingPrice));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId || !listingAgentId || !salePrice) {
      toast({ title: "Property, listing agent and sale price are required", variant: "destructive" });
      return;
    }
    try {
      const res = await create({
        propertyId,
        listingAgentId,
        sellingAgentId: sellingAgentId || null,
        buyerId: buyerId || null,
        salePrice: Number(salePrice) as any,
        code: code || null,
        paymentTerms: paymentTerms || null,
      } as any).unwrap();
      toast({ title: "Transaction created" });
      router.push(`/real-estate/transactions/${res.data.id}`);
    } catch (e: any) {
      toast({
        title: "Could not create transaction",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/real-estate/transactions" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            New transaction
          </h1>
          <p className="text-sm text-muted-foreground">
            Records a pending sale. Attach contract / sale-deed documents from
            the detail page, then close to fire the commission engine.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Property & buyer</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Property *" className="sm:col-span-2">
              <Select value={propertyId} onValueChange={onPickProperty}>
                <SelectTrigger><SelectValue placeholder="Pick a property" /></SelectTrigger>
                <SelectContent>
                  {allProperties.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      No available / under-contract properties
                    </SelectItem>
                  ) : (
                    allProperties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title} — {p.city} · {formatCurrency(p.listingPrice, p.currency)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {property?.minClosingPercent != null && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Min closing price: {formatCurrency((property.listingPrice * property.minClosingPercent) / 100, property.currency)} ({property.minClosingPercent}% of listing)
                </p>
              )}
            </Field>
            <Field label="Buyer ID (optional)" className="sm:col-span-2" hint="Future: pick from buyer registry. For now paste a Buyer.id.">
              <Input value={buyerId} onChange={(e) => setBuyerId(e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agents & price</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Listing agent *">
              <Select value={listingAgentId} onValueChange={setListingAgentId}>
                <SelectTrigger><SelectValue placeholder="Pick agent" /></SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.userId}>
                      {fullName(a.user!)}{a.rank ? ` · ${a.rank.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Selling agent" hint="Same as listing if a single-agent deal">
              <Select value={sellingAgentId || "SAME"} onValueChange={(v) => setSellingAgentId(v === "SAME" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SAME">Same as listing agent</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.userId}>
                      {fullName(a.user!)}{a.rank ? ` · ${a.rank.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Sale price *" className="sm:col-span-2">
              <Input
                type="number"
                inputMode="decimal"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Code (optional)" hint="e.g. TXN-2026-0007">
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment terms</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              rows={3}
              placeholder="Token amount, instalments, possession date…"
            />
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/real-estate/transactions")}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Creating…" : "Create transaction"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
