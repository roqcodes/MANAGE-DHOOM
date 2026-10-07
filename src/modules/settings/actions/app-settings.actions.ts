"use server";

import { revalidatePath } from "next/cache";

import {
  getAppSettingsForAdmin,
  updateAppSettings,
} from "@/modules/settings/services/app-settings.service";
import type { AppSettingsPatch } from "@/modules/settings/types";

export async function getAppSettingsAction() {
  return getAppSettingsForAdmin();
}

export async function updateAppSettingsAction(patch: AppSettingsPatch) {
  const result = await updateAppSettings(patch);
  revalidatePath("/admin/config");
  revalidatePath("/admin/business");
  return result;
}
