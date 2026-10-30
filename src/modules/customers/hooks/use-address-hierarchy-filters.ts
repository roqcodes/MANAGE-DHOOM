"use client";

import { useCallback, useMemo, useState } from "react";

import type { AddressLookupValue } from "@/modules/customers/components/address-lookup-field";
import type { AddressHierarchyFilterFieldsProps } from "@/modules/customers/components/address-hierarchy-filter-fields";
import {
  addressHierarchyToQueryRecord,
  type AddressHierarchyFilterParams,
} from "@/modules/customers/lib/address-hierarchy-filter";

export function useAddressHierarchyFilters(options?: {
  initial?: AddressHierarchyFilterParams;
}) {
  const [city, setCity] = useState<AddressLookupValue>(() => ({
    id: options?.initial?.cityId ?? null,
    name: "",
  }));
  const [street, setStreet] = useState<AddressLookupValue>(() => ({
    id: options?.initial?.streetId ?? null,
    name: "",
  }));
  const [mall, setMall] = useState<AddressLookupValue>(() => ({
    id: options?.initial?.mallId ?? null,
    name: "",
  }));

  const onCityChange = useCallback((next: AddressLookupValue) => {
    setCity(next);
    setStreet({ id: null, name: "" });
    setMall({ id: null, name: "" });
  }, []);

  const onStreetChange = useCallback((next: AddressLookupValue) => {
    setStreet(next);
    setMall({ id: null, name: "" });
  }, []);

  const params: AddressHierarchyFilterParams = useMemo(
    () => ({
      cityId: city.id,
      streetId: street.id,
      mallId: mall.id,
    }),
    [city.id, street.id, mall.id],
  );

  const listParams = useMemo(() => addressHierarchyToQueryRecord(params), [params]);

  const toolbarProps: AddressHierarchyFilterFieldsProps = {
    city,
    street,
    mall,
    onCityChange,
    onStreetChange,
    onMallChange: setMall,
  };

  return {
    params,
    listParams,
    isAddressFiltering: Boolean(params.cityId || params.streetId || params.mallId),
    clearAddressFilters: () => {
      setCity({ id: null, name: "" });
      setStreet({ id: null, name: "" });
      setMall({ id: null, name: "" });
    },
    toolbarProps,
  };
}
