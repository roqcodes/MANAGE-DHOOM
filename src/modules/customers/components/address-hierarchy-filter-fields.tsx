"use client";

import type { ReactNode } from "react";

import {
  AddressLookupField,
  type AddressLookupValue,
} from "@/modules/customers/components/address-lookup-field";
import {
  InputGroupAddon,
} from "@/components/ui/input-group";

export type AddressHierarchyFilterFieldsProps = {
  city: AddressLookupValue;
  street: AddressLookupValue;
  mall: AddressLookupValue;
  onCityChange: (value: AddressLookupValue) => void;
  onStreetChange: (value: AddressLookupValue) => void;
  onMallChange: (value: AddressLookupValue) => void;
  className?: string;
};

function ToolbarDivider() {
  return (
    <InputGroupAddon align="inline-start" className="px-0">
      <div className="h-4 w-px bg-border" aria-hidden />
    </InputGroupAddon>
  );
}

function InlineAddressSegment({ children }: { children: ReactNode }) {
  return (
    <InputGroupAddon
      align="inline-start"
      className="min-w-[6.75rem] max-w-[9.5rem] shrink-0 py-0 pl-1"
    >
      {children}
    </InputGroupAddon>
  );
}

/** City → street → mall inside AdminListCard / orders InputGroup (same row as search). */
export function AddressHierarchyFilterInline({
  city,
  street,
  mall,
  onCityChange,
  onStreetChange,
  onMallChange,
}: AddressHierarchyFilterFieldsProps) {
  return (
    <>
      <InlineAddressSegment>
        <AddressLookupField
          compact
          allowCreate={false}
          kind="city"
          label="City"
          value={city}
          onChange={onCityChange}
          placeholder="City"
        />
      </InlineAddressSegment>
      {city.id ? (
        <>
          <ToolbarDivider />
          <InlineAddressSegment>
            <AddressLookupField
              compact
              allowCreate={false}
              kind="street"
              label="Street"
              value={street}
              onChange={onStreetChange}
              parentContext={{ cityId: city.id }}
              placeholder="Street"
            />
          </InlineAddressSegment>
        </>
      ) : null}
      {street.id ? (
        <>
          <ToolbarDivider />
          <InlineAddressSegment>
            <AddressLookupField
              compact
              allowCreate={false}
              kind="mall"
              label="Mall"
              value={mall}
              onChange={onMallChange}
              parentContext={{ cityId: city.id, streetId: street.id }}
              placeholder="Mall"
            />
          </InlineAddressSegment>
        </>
      ) : null}
    </>
  );
}

/** @deprecated Use AddressHierarchyFilterInline in toolbars. */
export function AddressHierarchyFilterFields({
  city,
  street,
  mall,
  onCityChange,
  onStreetChange,
  onMallChange,
  className,
}: AddressHierarchyFilterFieldsProps) {
  return (
    <div
      className={
        className ?? "grid w-full min-w-0 gap-2 sm:grid-cols-3 lg:max-w-3xl"
      }
    >
      <AddressLookupField
        allowCreate={false}
        kind="city"
        label="City"
        value={city}
        onChange={onCityChange}
        placeholder="All cities"
      />
      {city.id ? (
        <AddressLookupField
          allowCreate={false}
          kind="street"
          label="Street"
          value={street}
          onChange={onStreetChange}
          parentContext={{ cityId: city.id }}
          placeholder="All streets"
        />
      ) : null}
      {street.id ? (
        <AddressLookupField
          allowCreate={false}
          kind="mall"
          label="Mall"
          value={mall}
          onChange={onMallChange}
          parentContext={{ cityId: city.id, streetId: street.id }}
          placeholder="All malls"
        />
      ) : null}
    </div>
  );
}
