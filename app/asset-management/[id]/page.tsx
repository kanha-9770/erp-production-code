"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  DetailShell,
  DetailLoading,
  DetailNotFound,
  DetailSection,
  DetailFact,
  fmtDate,
  fmtMoney,
} from "@/components/workspace/detail-shell";
import {
  Tag,
  User,
  CreditCard,
  Info,
  Smartphone,
} from "lucide-react";

const STORAGE_KEY = "asset-management:v3";
const BACK = "/asset-management";

interface Asset {
  id: string;
  name: string;
  type: string;
  status: string;
  purchaseDate: string;
  value: number;
  notes: string;
  employeeId?: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  assignedTo?: string;
  serialNo: string;
  assetModel?: string;
  configuration?: string;
  countryCode?: string;
  simNumber?: string;
  imsiNumber?: string;
  imei?: string;
  carrier?: string;
  simType?: string;
  planType?: string;
  simIssueBy?: string;
  simLocation?: string;
  simStatus?: string;
  plan?: string;
  rechargeDate?: string;
  rechargeAmount?: number;
  monthlyCost?: number;
}

const ASSET_TYPE_LABEL: Record<string, string> = {
  LAPTOP: "Laptop",
  DESKTOP: "Desktop",
  MOBILE_PHONE: "Mobile Phone",
  TABLET: "Tablet",
  MONITOR: "Monitor",
  HEADPHONE: "Headphone",
  KEYBOARD: "Keyboard",
  MOUSE: "Mouse",
  PRINTER: "Printer",
  CAMERA: "Camera",
  VEHICLE: "Vehicle",
  FURNITURE: "Furniture",
  ID_CARD: "ID Card",
  SIM: "SIM card",
  OTHER: "Other",
  PHONE: "Phone (legacy)",
  ACCESSORY: "Accessory (legacy)",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  AVAILABLE: "default",
  ASSIGNED: "secondary",
  UNDER_REPAIR: "outline",
  RETIRED: "destructive",
};

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [asset, setAsset] = useState<Asset | null>(null);

  useEffect(() => {
    if (!id) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const items: Asset[] = raw ? JSON.parse(raw) : [];
      const found = items.find((a) => a.id === id) ?? null;
      setAsset(found);
    } catch {
      setAsset(null);
    }
    setLoading(false);
  }, [id]);

  if (loading) return <DetailLoading />;
  if (!asset) return <DetailNotFound backHref={BACK} />;

  const assignee = asset.assignedTo
    ? asset.assignedTo
    : asset.firstName || asset.lastName
      ? `${asset.firstName ?? ""} ${asset.lastName ?? ""}`.trim()
      : null;

  const isSim = asset.type === "SIM";

  return (
    <DetailShell
      backHref={BACK}
      backLabel="Back to Asset Management"
      title={
        <span className="flex items-center gap-3 flex-wrap">
          {asset.name || ASSET_TYPE_LABEL[asset.type] || asset.id}
          <Badge variant={STATUS_VARIANT[asset.status]} className="text-[10px]">
            {asset.status}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {ASSET_TYPE_LABEL[asset.type] ?? asset.type}
          </Badge>
        </span>
      }
      subtitle={asset.id}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailSection title="Asset" icon={<Tag className="h-3.5 w-3.5" />}>
          <DetailFact label="Asset ID" value={asset.id} mono />
          <DetailFact label="Name" value={asset.name} />
          <DetailFact label="Type" value={ASSET_TYPE_LABEL[asset.type] ?? asset.type} />
          <DetailFact label="Status" value={asset.status} />
          {!isSim ? (
            <>
              <DetailFact label="Serial number" value={asset.serialNo} mono />
              <DetailFact label="Model" value={asset.assetModel} />
              <DetailFact label="Configuration" value={asset.configuration} wide />
            </>
          ) : null}
          <DetailFact label="Purchase date" value={fmtDate(asset.purchaseDate)} />
          <DetailFact label="Value" value={fmtMoney(asset.value)} mono />
        </DetailSection>

        <DetailSection title="Assignment" icon={<User className="h-3.5 w-3.5" />}>
          <DetailFact label="Assigned to" value={assignee} />
          <DetailFact label="Department" value={asset.department} />
          <DetailFact label="Employee ID" value={asset.employeeId} mono />
        </DetailSection>

        {isSim ? (
          <DetailSection
            title="SIM details"
            icon={<Smartphone className="h-3.5 w-3.5" />}
            className="lg:col-span-2"
          >
            <DetailFact
              label="Mobile number"
              value={asset.simNumber ? `${asset.countryCode ?? ""} ${asset.simNumber}` : null}
              mono
            />
            <DetailFact label="IMSI" value={asset.imsiNumber} mono />
            <DetailFact label="IMEI" value={asset.imei} mono />
            <DetailFact label="Carrier" value={asset.carrier} />
            <DetailFact label="Plan type" value={asset.plan} />
            <DetailFact label="SIM type" value={asset.simType} />
            <DetailFact label="SIM status" value={asset.simStatus} />
            <DetailFact label="Issued by" value={asset.simIssueBy} />
            <DetailFact label="Location" value={asset.simLocation} />
            <DetailFact label="Last recharge" value={fmtDate(asset.rechargeDate)} />
            <DetailFact label="Recharge amount" value={fmtMoney(asset.rechargeAmount)} mono />
            <DetailFact label="Monthly cost" value={fmtMoney(asset.monthlyCost)} mono />
          </DetailSection>
        ) : null}

        <DetailSection
          title="Notes"
          icon={<Info className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Notes" value={asset.notes} wide />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
