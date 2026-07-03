import { type BillOfLading } from "@/lib/bol-data";
import { fmtDateYear } from "@/lib/utils";

/** VICS BOL form rendered as a print-ready document. */
export function BolDocument({ bol }: { bol: BillOfLading }) {
  return (
    <div className="bg-white text-black font-sans text-[10px] leading-tight border border-black/80 print:border-0">
      {/* Header band */}
      <div className="flex items-stretch border-b border-black/80">
        <div className="flex-1 px-3 py-2">
          <div className="text-[8px] uppercase tracking-widest text-black/60">
            VICS Bill of Lading — Voluntary Interindustry Commerce Standards
          </div>
          <div className="text-base font-bold tracking-tight">
            {bol.type === "master" ? "MASTER BILL OF LADING" : "BILL OF LADING"}
          </div>
          <div className="text-[10px] mt-0.5">
            Issued by AZUX 3PL · {bol.scac} · {bol.serviceLevel}
          </div>
        </div>
        <div className="w-72 border-l border-black/80 p-2 grid grid-cols-2 gap-x-2 gap-y-1">
          <Cell label="BOL Number" mono>
            {bol.bolNumber}
          </Cell>
          <Cell label="PRO #" mono>
            {bol.proNumber}
          </Cell>
          <Cell label="Carrier">{bol.carrier}</Cell>
          <Cell label="SCAC" mono>
            {bol.scac}
          </Cell>
          <Cell label="Trailer" mono>
            {bol.trailerNumber}
          </Cell>
          <Cell label="Seal" mono>
            {bol.sealNumber}
          </Cell>
        </div>
      </div>

      {/* Shipper / Consignee block */}
      <div className="grid grid-cols-2 border-b border-black/80">
        <Party title="SHIP FROM" p={bol.shipper} sidLabel="SID #" sid={bol.shipper.sid} />
        <div className="border-l border-black/80">
          <Party title="SHIP TO" p={bol.consignee} sidLabel="CID #" sid={bol.consignee.cid} />
        </div>
      </div>

      {/* Third-party / Bill-to */}
      <div className="grid grid-cols-2 border-b border-black/80">
        <div className="p-2">
          <SectionLabel>BILL FREIGHT CHARGES TO</SectionLabel>
          <div className="mt-1 capitalize">{bol.freightChargeTerms}</div>
          {bol.thirdPartyAccount && (
            <div className="text-[9px] mt-1">Third party acct: {bol.thirdPartyAccount}</div>
          )}
          <div className="mt-1 grid grid-cols-3 gap-1">
            <Check label="Prepaid" on={bol.freightChargeTerms === "prepaid"} />
            <Check label="Collect" on={bol.freightChargeTerms === "collect"} />
            <Check label="3rd Party" on={bol.freightChargeTerms === "third-party"} />
          </div>
        </div>
        <div className="border-l border-black/80 p-2 grid grid-cols-2 gap-y-1">
          <Cell label="Pickup Date">{fmtDateYear(bol.pickupDate)}</Cell>
          <Cell label="Generated">{fmtDateYear(bol.createdAt)}</Cell>
          <Cell label="COD ($)" mono>
            {bol.cod.toFixed(2)}
          </Cell>
          <Cell label="Declared Value ($)" mono>
            {bol.declaredValue.toLocaleString()}
          </Cell>
        </div>
      </div>

      {/* Customer order info */}
      <div className="border-b border-black/80">
        <div className="px-2 py-1 bg-black text-white text-[9px] uppercase tracking-wider">
          Customer Order Information
        </div>
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr className="bg-black/5">
              <Th>Customer Order #</Th>
              <Th>Internal Order #</Th>
              <Th className="text-right">Pkgs</Th>
              <Th className="text-right">Weight (lb)</Th>
              <Th className="text-center">Pallet/Slip Y/N</Th>
              <Th>Additional Info</Th>
            </tr>
          </thead>
          <tbody>
            {bol.childOrderIds.map((oid, idx) => {
              const olines = bol.lines.filter((l) => l.orderId === oid);
              const pkgs = olines.reduce((a, l) => a + l.qty, 0);
              const wt = olines.reduce((a, l) => a + l.weightLbs, 0).toFixed(1);
              const hasPallet = olines.some((l) => l.pkgType === "PLT");
              return (
                <tr key={oid} className="border-t border-black/30">
                  <Td mono>{olines[0]?.poNumber ?? "—"}</Td>
                  <Td mono>{oid}</Td>
                  <Td className="text-right tabular-nums">{pkgs}</Td>
                  <Td className="text-right tabular-nums">{wt}</Td>
                  <Td className="text-center">{hasPallet ? "Y" : "N"}</Td>
                  <Td>{bol.type === "master" ? `Sub-BOL ${bol.childBolIds?.[idx] ?? ""}` : "—"}</Td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-black/80 bg-black/5 font-semibold">
              <Td>GRAND TOTAL</Td>
              <Td>—</Td>
              <Td className="text-right tabular-nums">{bol.totals.pallets + bol.totals.cartons}</Td>
              <Td className="text-right tabular-nums">{bol.totals.weightLbs.toLocaleString()}</Td>
              <Td className="text-center">{bol.totals.pallets > 0 ? "Y" : "N"}</Td>
              <Td>—</Td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Carrier info / NMFC */}
      <div>
        <div className="px-2 py-1 bg-black text-white text-[9px] uppercase tracking-wider">
          Carrier Information — Handling Units, NMFC, Freight Class
        </div>
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr className="bg-black/5">
              <Th className="text-right">HU Qty</Th>
              <Th>Type</Th>
              <Th className="text-right">Weight (lb)</Th>
              <Th className="text-center">H/M (X)</Th>
              <Th>Commodity Description</Th>
              <Th>NMFC #</Th>
              <Th className="text-right">Class</Th>
            </tr>
          </thead>
          <tbody>
            {bol.lines.map((l, i) => (
              <tr key={i} className="border-t border-black/30">
                <Td className="text-right tabular-nums">{l.qty}</Td>
                <Td mono>{l.pkgType}</Td>
                <Td className="text-right tabular-nums">{l.weightLbs.toFixed(1)}</Td>
                <Td className="text-center">{l.hazmat ? "X" : ""}</Td>
                <Td>
                  <div>{l.description}</div>
                  <div className="text-[8px] text-black/60">
                    SKU {l.sku} · PO {l.poNumber} · SO {l.orderId}
                  </div>
                </Td>
                <Td mono>{l.nmfc}</Td>
                <Td className="text-right tabular-nums">{l.freightClass}</Td>
              </tr>
            ))}
            <tr className="border-t-2 border-black/80 bg-black/5 font-semibold">
              <Td className="text-right tabular-nums">{bol.totals.pallets + bol.totals.cartons}</Td>
              <Td>—</Td>
              <Td className="text-right tabular-nums">{bol.totals.weightLbs.toLocaleString()}</Td>
              <Td />
              <Td>GRAND TOTAL</Td>
              <Td />
              <Td />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Special instructions + signature blocks */}
      <div className="border-t border-black/80 px-2 py-1">
        <SectionLabel>Special Instructions</SectionLabel>
        <div className="text-[10px] mt-0.5">{bol.specialInstructions}</div>
      </div>

      <div className="grid grid-cols-3 border-t border-black/80">
        <Signature
          title="Shipper Signature / Date"
          subtitle="This is to certify that the above named materials are properly classified, packaged, marked and labeled, and are in proper condition for transportation according to applicable regulations of the DOT."
        />
        <div className="border-l border-black/80">
          <Signature
            title="Trailer Loaded / Freight Counted"
            subtitle="By shipper · By driver · Pieces counted by driver"
          />
        </div>
        <div className="border-l border-black/80">
          <Signature
            title="Carrier Signature / Pickup Date"
            subtitle="Carrier acknowledges receipt of packages and required placards. Property described above received in good order, except as noted."
          />
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-black/80 px-3 py-1.5 flex items-center justify-between text-[8px] uppercase tracking-widest text-black/60">
        <span>
          AZUX 3PL · {bol.scac} · VICS BOL {bol.type === "master" ? "Master" : "Standard"}
        </span>
        <span>Generated by AZUX 3PL WMS Systems</span>
        <span className="font-mono">BOL {bol.bolNumber}</span>
      </div>
    </div>
  );
}

/* ────────── tiny presentation helpers ────────────────────────────── */

function Cell({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[8px] uppercase tracking-wider text-black/60">{label}</div>
      <div className={`truncate ${mono ? "font-mono" : ""}`}>{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[8px] uppercase tracking-widest text-black/60">{children}</div>;
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

function Check({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <div
        className={`h-3 w-3 border border-black/80 flex items-center justify-center text-[10px] font-bold ${on ? "bg-black text-white" : ""}`}
      >
        {on ? "X" : ""}
      </div>
      <span className="text-[9px]">{label}</span>
    </div>
  );
}

function Party({
  title,
  p,
  sidLabel,
  sid,
}: {
  title: string;
  p: {
    name: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    zip: string;
    contact?: string;
    phone?: string;
  };
  sidLabel: string;
  sid?: string;
}) {
  return (
    <div className="p-2">
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-0.5 font-semibold">{p.name}</div>
      <div>{p.address1}</div>
      {p.address2 && <div>{p.address2}</div>}
      <div>
        {p.city}, {p.state} {p.zip}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-2">
        <Cell label="Contact">{p.contact ?? "—"}</Cell>
        <Cell label="Phone" mono>
          {p.phone ?? "—"}
        </Cell>
        <Cell label={sidLabel} mono>
          {sid ?? "—"}
        </Cell>
        <Cell label="FOB">No</Cell>
      </div>
    </div>
  );
}

function Signature({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="px-2 py-2">
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-3 border-b border-black/80 h-6" />
      <div className="text-[8px] text-black/60 mt-1">{subtitle}</div>
    </div>
  );
}
