"use client";

/**
 * Properties — list page with filters, search, and a card grid.
 * FR-1.6 — search/filter by type, location, price range, status, and listing
 *          agent.
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import { useGetPropertiesQuery } from "@/lib/api/real-estate/properties";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  Plus,
  Search,
  MapPin,
  Bed,
  Bath,
  Maximize,
  ChevronLeft,
  ChevronRight,
  ImageOff,
} from "lucide-react";
import {
  PROPERTY_STATUS_LABEL,
  PROPERTY_STATUS_OPTIONS,
  PROPERTY_STATUS_VARIANT,
  PROPERTY_TYPE_LABEL,
  PROPERTY_TYPE_OPTIONS,
  PROPERTY_SUBTYPE_LABEL,
  formatCurrency,
} from "@/components/real-estate/constants";

const PAGE_SIZE = 24;

export default function PropertiesListPage() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [type, setType] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [city, setCity] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading, isFetching } = useGetPropertiesQuery({
    search: search || undefined,
    type: type || undefined,
    status: status || undefined,
    city: city || undefined,
    minPrice: minPrice || undefined,
    maxPrice: maxPrice || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const items = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const applySearch = () => {
    setSearch(searchInput.trim());
    setPage(0);
  };

  const resetFilters = () => {
    setSearch("");
    setSearchInput("");
    setType("");
    setStatus("");
    setCity("");
    setMinPrice("");
    setMaxPrice("");
    setPage(0);
  };

  const hasFilters = useMemo(
    () => !!(search || type || status || city || minPrice || maxPrice),
    [search, type, status, city, minPrice, maxPrice],
  );

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <Building2 className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
            Properties
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total.toLocaleString()} listing{total === 1 ? "" : "s"}
          </p>
        </div>
        <Button asChild>
          <Link href="/real-estate/properties/new">
            <Plus className="h-4 w-4 mr-2" />
            New listing
          </Link>
        </Button>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2 flex gap-2">
            <Input
              placeholder="Title, code, address…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
            />
            <Button variant="outline" size="icon" onClick={applySearch} aria-label="Search">
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <Select value={type || "ALL"} onValueChange={(v) => { setType(v === "ALL" ? "" : v); setPage(0); }}>
            <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              {PROPERTY_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status || "ALL"} onValueChange={(v) => { setStatus(v === "ALL" ? "" : v); setPage(0); }}>
            <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {PROPERTY_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setPage(0)}
          />
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Min ₹"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Max ₹"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="lg:col-span-6 justify-self-start">
              Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No properties match your filters.</p>
            {hasFilters ? (
              <Button variant="link" onClick={resetFilters}>Clear filters</Button>
            ) : (
              <Button asChild variant="link">
                <Link href="/real-estate/properties/new">Add your first listing</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((p) => (
            <Link
              key={p.id}
              href={`/real-estate/properties/${p.id}`}
              className="block group"
            >
              <Card className="overflow-hidden h-full transition-shadow group-hover:shadow-md">
                <div className="aspect-[4/3] bg-muted relative">
                  {p.primaryImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.primaryImageUrl}
                      alt={p.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageOff className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                  )}
                  <Badge
                    variant={PROPERTY_STATUS_VARIANT[p.status]}
                    className="absolute top-2 left-2 text-[10px]"
                  >
                    {PROPERTY_STATUS_LABEL[p.status]}
                  </Badge>
                </div>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold leading-tight line-clamp-1">
                      {p.title}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {p.city}
                      {p.state ? `, ${p.state}` : ""}
                    </span>
                  </div>
                  <div className="text-lg font-bold tabular-nums">
                    {formatCurrency(p.listingPrice, p.currency)}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                    {p.bedrooms != null && (
                      <span className="flex items-center gap-1">
                        <Bed className="h-3 w-3" /> {p.bedrooms}
                      </span>
                    )}
                    {p.bathrooms != null && (
                      <span className="flex items-center gap-1">
                        <Bath className="h-3 w-3" /> {p.bathrooms}
                      </span>
                    )}
                    {p.area != null && (
                      <span className="flex items-center gap-1">
                        <Maximize className="h-3 w-3" /> {p.area}
                        {p.areaUnit ? ` ${p.areaUnit}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <Badge variant="outline" className="text-[10px]">
                      {PROPERTY_TYPE_LABEL[p.type]}
                      {p.subType ? ` · ${PROPERTY_SUBTYPE_LABEL[p.subType]}` : ""}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {pages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0 || isFetching}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pages || isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
