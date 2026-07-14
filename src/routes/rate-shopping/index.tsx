import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Truck,
  Search,
  Package,
  MapPin,
  Weight,
  Ruler,
  DollarSign,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { simulateRateQuotes, type RateQuoteRequest, type RateQuote } from "@/lib/index";

export const Route = createFileRoute("/rate-shopping/")({
  head: () => ({
    meta: [
      { title: "Rate Shopping � AZUX 3PL WMS Systems" },
      { name: "description", content: "Multi-carrier rate comparison for LTL and parcel shipments." },
    ],
  }),
  component: RateShoppingPage,
});

type Step = "input" | "results";

function RateShoppingPage() {
  const [step, setStep] = useState<Step>("input");
  const [loading, setLoading] = useState(false);
  const [quotes, setQuotes] = useState<RateQuote[]>([]);
  const [form, setForm] = useState({
    originZip: "30301",
    originCountry: "US",
    destinationZip: "10001",
    destinationCountry: "US",
    weightLbs: 50,
    lengthIn: 20,
    widthIn: 16,
    heightIn: 12,
    declaredValue: 500,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const request: RateQuoteRequest = {
        tenantId: "acme",
        warehouseId: "atl1",
        ...form,
      };
      const response = await simulateRateQuotes(request);
      setQuotes(response.quotes);
      setStep("results");
      toast.success(`Found ${response.quotes.length} rate options`);
    } catch (err) {
      console.error(err);
      toast.error("Rate shopping failed");
    } finally {
      setLoading(false);
    }
  };

  const cheapest = quotes.length > 0 ? quotes[0] : null;
  const fastest = quotes.length > 0 ? [...quotes].sort((a, b) => a.transitDays - b.transitDays)[0] : null;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Multi-Carrier Rate Shopping</h1>
        <p className="text-muted-foreground">Compare LTL and parcel rates across carriers in real time.</p>
      </div>

      {step === "input" && (
        <Card>
          <CardHeader>
            <CardTitle>Shipment Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Origin ZIP</Label>
                  <Input
                    value={form.originZip}
                    onChange={(e) => setForm({ ...form, originZip: e.target.value })}
                    placeholder="30301"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Destination ZIP</Label>
                  <Input
                    value={form.destinationZip}
                    onChange={(e) => setForm({ ...form, destinationZip: e.target.value })}
                    placeholder="10001"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Weight (lbs)</Label>
                  <Input
                    type="number"
                    value={form.weightLbs}
                    onChange={(e) => setForm({ ...form, weightLbs: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Length (in)</Label>
                  <Input
                    type="number"
                    value={form.lengthIn}
                    onChange={(e) => setForm({ ...form, lengthIn: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Width (in)</Label>
                  <Input
                    type="number"
                    value={form.widthIn}
                    onChange={(e) => setForm({ ...form, widthIn: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Height (in)</Label>
                  <Input
                    type="number"
                    value={form.heightIn}
                    onChange={(e) => setForm({ ...form, heightIn: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Declared Value ($)</Label>
                  <Input
                    type="number"
                    value={form.declaredValue}
                    onChange={(e) => setForm({ ...form, declaredValue: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                Compare Rates
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {step === "results" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("input")}>
              <Package className="h-4 w-4 mr-2" /> New Search
            </Button>
          </div>

          {cheapest && (
            <Card className="border-emerald-500/50 bg-emerald-950/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-emerald-400">
                  <DollarSign className="h-5 w-5" /> Best Rate: {cheapest.carrierName} � ${cheapest.totalRate.toFixed(2)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Service</div>
                    <div className="font-medium">{cheapest.serviceLevel.replace(/_/g, " ")}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Transit</div>
                    <div className="font-medium">{cheapest.transitDays} days</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Base Rate</div>
                    <div className="font-medium">${cheapest.baseRate.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Fuel Surcharge</div>
                    <div className="font-medium">${cheapest.fuelSurcharge.toFixed(2)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {fastest && fastest.carrierId !== cheapest?.carrierId && (
            <Card className="border-sky-500/50 bg-sky-950/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sky-400">
                  <Truck className="h-5 w-5" /> Fastest: {fastest.carrierName} � {fastest.transitDays} days
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm">Total: ${fastest.totalRate.toFixed(2)}</div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>All Quotes ({quotes.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {quotes.map((quote) => (
                  <div
                    key={`${quote.carrierId}-${quote.serviceLevel}`}
                    className="flex items-center justify-between py-3 border-b last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="font-medium">{quote.carrierName}</div>
                        <div className="text-xs text-muted-foreground">
                          {quote.serviceLevel.replace(/_/g, " ")} � {quote.transitDays} days
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">${quote.totalRate.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground">
                        Base ${quote.baseRate.toFixed(2)} + Fuel ${quote.fuelSurcharge.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
