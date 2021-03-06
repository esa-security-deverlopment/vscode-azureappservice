/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const deploymentFileName: string = '.deployment';
export const deploymentFile: string = `[config]
SCM_DO_BUILD_DURING_DEPLOYMENT=true`;
export const none: string = 'None';
export const isWindows: boolean = /^win/.test(process.platform);

export const extensionPrefix: string = 'appService';

export enum configurationSettings {
    zipIgnorePattern = 'zipIgnorePattern',
    showBuildDuringDeployPrompt = 'showBuildDuringDeployPrompt',
    deploySubpath = 'deploySubpath',
    advancedCreation = 'advancedCreation',
    defaultWebAppToDeploy = 'defaultWebAppToDeploy',
    connections = 'connections'
}

export enum ScmType {
    None = 'None', // default scmType
    LocalGit = 'LocalGit',
    GitHub = 'GitHub'
}

export const envFileName: string = '.env';
export const toggleValueVisibilityCommandId: string = 'appService.toggleValueVisibility';
