// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/**
 * Event type for telemetry
 */
export enum EventType {
  CreateInterface = "vespucci-dtdl.createInterface",
  AddSensorInterface = "vespucci-dtdl.addSensorInterface",
  AddControllerInterface = "vespucci-dtdl.addControllerInterface",
  AddAlgorithmInterface = "vespucci-dtdl.addAlgorithmInterface",
  OpenModelFile = "openModelFile"
}
