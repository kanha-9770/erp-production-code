"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Search } from "lucide-react"

// Master products data (this would come from your Masters module)
const masterProducts = {
  machine: [
    { id: "M001", name: "CNC Machine - Model X200", category: "Machine", price: 125000, unit: "Each" },
    { id: "M002", name: "Lathe Machine - L500", category: "Machine", price: 85000, unit: "Each" },
    { id: "M003", name: "Milling Machine - ML300", category: "Machine", price: 95000, unit: "Each" },
    { id: "M004", name: "Drilling Machine - DR150", category: "Machine", price: 35000, unit: "Each" },
  ],
  mold: [
    { id: "MO001", name: "Injection Mold - IM-001", category: "Mold", price: 15000, unit: "Each" },
    { id: "MO002", name: "Compression Mold - CM-002", category: "Mold", price: 12000, unit: "Each" },
    { id: "MO003", name: "Blow Mold - BM-003", category: "Mold", price: 18000, unit: "Each" },
    { id: "MO004", name: "Transfer Mold - TM-004", category: "Mold", price: 14000, unit: "Each" },
  ],
  store: [
    { id: "S001", name: "Cutting Oil - Grade A", category: "Store", price: 25, unit: "Liter" },
    { id: "S002", name: "Hydraulic Fluid - HF200", category: "Store", price: 45, unit: "Liter" },
    { id: "S003", name: "Coolant - Industrial Grade", category: "Store", price: 35, unit: "Liter" },
    { id: "S004", name: "Lubricant - Multi-Purpose", category: "Store", price: 28, unit: "Liter" },
  ],
  metal: [
    { id: "MT001", name: "Steel Rod - 12mm", category: "Metal", price: 150, unit: "Meter" },
    { id: "MT002", name: "Aluminum Sheet - 2mm", category: "Metal", price: 85, unit: "Sq Meter" },
    { id: "MT003", name: "Copper Wire - 5mm", category: "Metal", price: 12, unit: "Meter" },
    { id: "MT004", name: "Brass Tube - 10mm", category: "Metal", price: 25, unit: "Meter" },
  ],
}

// Flatten all products for easy searching
const allProducts = [
  ...masterProducts.machine,
  ...masterProducts.mold,
  ...masterProducts.store,
  ...masterProducts.metal,
]

interface QuotationItem {
  id: string
  productId: string
  productName: string
  category: string
  quantity: number
  unit: string
  unitPrice: number
  discount: number
  total: number
}

interface NewQuotationFormProps {
  onClose: () => void
}

export function NewQuotationForm({ onClose }: NewQuotationFormProps) {
  const [quotationData, setQuotationData] = useState({
    customer: "",
    customerEmail: "",
    customerPhone: "",
    validUntil: "",
    notes: "",
    terms: "",
  })

  const [quotationItems, setQuotationItems] = useState<QuotationItem[]>([])
  const [selectedProduct, setSelectedProduct] = useState("")
  const [productSearch, setProductSearch] = useState("")

  const filteredProducts = allProducts.filter(
    (product) =>
      product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      product.category.toLowerCase().includes(productSearch.toLowerCase()),
  )

  const addQuotationItem = () => {
    if (!selectedProduct) return

    const product = allProducts.find((p) => p.id === selectedProduct)
    if (!product) return

    const newItem: QuotationItem = {
      id: `item-${Date.now()}`,
      productId: product.id,
      productName: product.name,
      category: product.category,
      quantity: 1,
      unit: product.unit,
      unitPrice: product.price,
      discount: 0,
      total: product.price,
    }

    setQuotationItems([...quotationItems, newItem])
    setSelectedProduct("")
    setProductSearch("")
  }

  const updateQuotationItem = (itemId: string, field: keyof QuotationItem, value: any) => {
    setQuotationItems((items) =>
      items.map((item) => {
        if (item.id === itemId) {
          const updatedItem = { ...item, [field]: value }
          if (field === "quantity" || field === "unitPrice" || field === "discount") {
            const subtotal = updatedItem.quantity * updatedItem.unitPrice
            updatedItem.total = subtotal - (subtotal * updatedItem.discount) / 100
          }
          return updatedItem
        }
        return item
      }),
    )
  }

  const removeQuotationItem = (itemId: string) => {
    setQuotationItems((items) => items.filter((item) => item.id !== itemId))
  }

  const calculateTotals = () => {
    const subtotal = quotationItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    const totalDiscount = quotationItems.reduce(
      (sum, item) => sum + (item.quantity * item.unitPrice * item.discount) / 100,
      0,
    )
    const total = subtotal - totalDiscount
    const tax = total * 0.18 // 18% GST
    const grandTotal = total + tax

    return { subtotal, totalDiscount, total, tax, grandTotal }
  }

  const totals = calculateTotals()

  const handleSubmit = () => {
    // In a real application, this would save to database
    console.log("Quotation Data:", quotationData)
    console.log("Quotation Items:", quotationItems)
    console.log("Totals:", totals)

    // Show success message and close
    alert("Quotation created successfully!")
    onClose()
  }

  return (
    <div className="space-y-6">
      {/* Customer Information */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="customer">Customer Name *</Label>
            <Input
              id="customer"
              value={quotationData.customer}
              onChange={(e) => setQuotationData({ ...quotationData, customer: e.target.value })}
              placeholder="Enter customer name"
            />
          </div>
          <div>
            <Label htmlFor="customerEmail">Email</Label>
            <Input
              id="customerEmail"
              type="email"
              value={quotationData.customerEmail}
              onChange={(e) => setQuotationData({ ...quotationData, customerEmail: e.target.value })}
              placeholder="customer@example.com"
            />
          </div>
          <div>
            <Label htmlFor="customerPhone">Phone</Label>
            <Input
              id="customerPhone"
              value={quotationData.customerPhone}
              onChange={(e) => setQuotationData({ ...quotationData, customerPhone: e.target.value })}
              placeholder="Enter phone number"
            />
          </div>
          <div>
            <Label htmlFor="validUntil">Valid Until *</Label>
            <Input
              id="validUntil"
              type="date"
              value={quotationData.validUntil}
              onChange={(e) => setQuotationData({ ...quotationData, validUntil: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Product Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Add Products from Masters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <Label htmlFor="productSearch">Search Products</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  id="productSearch"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search by product name or category..."
                  className="pl-10"
                />
              </div>
            </div>
            <div className="w-64">
              <Label htmlFor="productSelect">Select Product</Label>
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose product" />
                </SelectTrigger>
                <SelectContent>
                  {filteredProducts.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {product.category}
                        </Badge>
                        <span>{product.name}</span>
                        <span className="text-muted-foreground">
                          (${product.price.toLocaleString()}/{product.unit})
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={addQuotationItem} disabled={!selectedProduct}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quotation Items */}
      <Card>
        <CardHeader>
          <CardTitle>Quotation Items ({quotationItems.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {quotationItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No items added yet. Select products from masters to add them to the quotation.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Unit Price</TableHead>
                  <TableHead>Discount %</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotationItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateQuotationItem(item.id, "quantity", Number.parseInt(e.target.value) || 0)}
                        className="w-20"
                        min="1"
                      />
                    </TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) =>
                          updateQuotationItem(item.id, "unitPrice", Number.parseFloat(e.target.value) || 0)
                        }
                        className="w-24"
                        min="0"
                        step="0.01"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.discount}
                        onChange={(e) =>
                          updateQuotationItem(item.id, "discount", Number.parseFloat(e.target.value) || 0)
                        }
                        className="w-20"
                        min="0"
                        max="100"
                        step="0.1"
                      />
                    </TableCell>
                    <TableCell className="font-medium">${item.total.toLocaleString()}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeQuotationItem(item.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Totals */}
      {quotationItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Quotation Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-w-md ml-auto">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>${totals.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>Total Discount:</span>
                <span>-${totals.totalDiscount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>After Discount:</span>
                <span>${totals.total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax (18% GST):</span>
                <span>${totals.tax.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Grand Total:</span>
                <span>${totals.grandTotal.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Additional Information */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={quotationData.notes}
              onChange={(e) => setQuotationData({ ...quotationData, notes: e.target.value })}
              placeholder="Add any additional notes or specifications..."
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="terms">Terms & Conditions</Label>
            <Textarea
              id="terms"
              value={quotationData.terms}
              onChange={(e) => setQuotationData({ ...quotationData, terms: e.target.value })}
              placeholder="Enter terms and conditions..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!quotationData.customer || !quotationData.validUntil || quotationItems.length === 0}
        >
          Create Quotation
        </Button>
      </div>
    </div>
  )
}
