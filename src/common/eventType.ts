// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/**
 * Event type for telemetry
 */
export enum EventType {
  CreateDeviceModel = "vespucci-dtdl.createDeviceModel",
  AddSensorInterface = "vespucci-dtdl.addSensorInterface",
  AddControllerInterface = "vespucci-dtdl.addControllerInterface",
  AddAlgorithmInterface = "vespucci-dtdl.addAlgorithmInterface",
  AddTagsInterface = "vespucci-dtdl.addTagsInterface",
  AddMobileAppsInterface = "vespucci-dtdl.addMobileAppsInterface",
  AddOutputDataInterface = "vespucci-dtdl.addOutputDataInterface",
  OpenModelFile = "openModelFile"
}
