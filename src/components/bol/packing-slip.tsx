import { type BillOfLading } from "@/lib/bol-data";

export function PackingSlip({ bol }: { bol: BillOfLading }) {
  return (
    <div className="bg-white text-black font-sans text-[10px] leading-tight border border-black/80 print:border-0 max-w-[8.5in] mx-auto">
      {/* Header */}
      <div className="border-b border-black/80 pb-2 mb-2">
        <div className="text-center">
          <div className="text-base font-bold">PACKING SLIP</div>
          <div className="text-[8px] uppercase tracking-widest text-black/60">
            Generic Packing Slip · AZUX 3PL WMS
          </div>
        </div>
      </div>

      {/* Order Info */}
      <div className="grid grid-cols-2 gap-4 mb-3 text-[10px]">
        <div>
          <div className="font-semibold">Ship From</div>
          <div>{bol.shipper.name}</div>
          <div>{bol.shipper.address1}</div>
          {bol.shipper.address2 && <div>{bol.shipper.address2}</div>}
          <div>
            {bol.shipper.city}, {bol.shipper.state} {bol.shipper.zip}
          </div>
        </div>
        <div>
          <div className="font-semibold">Ship To</div>
          <div>{bol.consignee.name}</div>
          <div>{bol.consignee.address1}</div>
          {bol.consignee.address2 && <div>{bol.consignee.address2}</div>}
          <div>
            {bol.consignee.city}, {bol.consignee.state} {bol.consignee.zip}
          </div>
        </div>
      </div>

      {/* Order Details */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-[10px] border-y border-black/80 py-2">
        <div>
          <span className="text-black/60">BOL #:</span>{" "}
          <span className="font-mono">{bol.bolNumber}</span>
        </div>
        <div>
          <span className="text-black/60">PRO #:</span>{" "}
          <span className="font-mono">{bol.proNumber}</span>
        </div>
        <div>
          <span className="text-black/60">Carrier:</span> {bol.carrier}
        </div>
      </div>

      {/* Line Items */}
      <table className="w-full text-[10px] border-collapse mb-3">
        <thead>
          <tr className="bg-black/5">
            <Th>SKU</Th>
            <Th>Description</Th>
            <Th className="text-right">Qty</Th>
            <Th className="text-right">Weight (lb)</Th>
            <Th>Location / Pallet</Th>
          </tr>
        </thead>
        <tbody>
          {bol.lines.map((l, i) => (
            <tr key={i} className="border-t border-black/30">
              <Td mono>{l.sku}</Td>
              <Td>{l.description}</Td>
              <Td className="text-right tabular-nums">
                {l.qty} {l.pkgType}
              </Td>
              <Td className="text-right tabular-nums">{l.weightLbs.toFixed(1)}</Td>
              <Td className="font-mono text-[9px]">{l.poNumber}</Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black/80 bg-black/5 font-semibold">
            <Td>GRAND TOTAL</Td>
            <Td />
            <Td className="text-right tabular-nums">{bol.totals.pallets + bol.totals.cartons}</Td>
            <Td className="text-right tabular-nums">{bol.totals.weightLbs.toLocaleString()}</Td>
            <Td />
          </tr>
        </tfoot>
      </table>

      {/* Notes */}
      <div className="border-t border-black/80 pt-2">
        <div className="text-[8px] uppercase tracking-wider text-black/60 mb-1">
          Special Instructions
        </div>
        <div className="text-[10px]">{bol.specialInstructions}</div>
      </div>

      <div className="border-t border-black/80 pt-3 mt-4">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="text-[8px] uppercase tracking-wider text-black/60">Prepared By</div>
            <div className="border-b border-black/80 h-6 mt-1" />
          </div>
          <div>
            <div className="text-[8px] uppercase tracking-wider text-black/60">Received By</div>
            <div className="border-b border-black/80 h-6 mt-1" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-2 py-1 text-left text-[9px] uppercase tracking-wider font-semibold ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  mono,
}: {
  children?: React.ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <td className={`px-2 py-1 align-top ${mono ? "font-mono" : ""} ${className}`}>{children}</td>
  );
}
