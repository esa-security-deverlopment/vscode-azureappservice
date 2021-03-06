/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigurationTarget, MessageItem, window, workspace, WorkspaceConfiguration } from 'vscode';
import { AzureParentTreeItem, IActionContext, parseError, SubscriptionTreeItem } from "vscode-azureextensionui";
import { configurationSettings, extensionPrefix } from "../constants";
import { SiteTreeItem } from "../explorer/SiteTreeItem";
import { WebAppTreeItem } from "../explorer/WebAppTreeItem";
import { ext } from "../extensionVariables";
import { deploy } from "./deploy";

const yesButton: MessageItem = { title: 'Yes' };
const noButton: MessageItem = { title: 'No', isCloseAffordance: true };

export async function createWebApp(actionContext: IActionContext, node?: AzureParentTreeItem | undefined): Promise<void> {
    if (!node) {
        node = <AzureParentTreeItem>await ext.tree.showTreeItemPicker(SubscriptionTreeItem.contextValue);
    }

    let createdApp: SiteTreeItem | undefined;
    try {
        createdApp = <WebAppTreeItem>await node.createChild(actionContext);
    } catch (error) {
        const workspaceConfig: WorkspaceConfiguration = workspace.getConfiguration(extensionPrefix);
        const advancedCreation: boolean | undefined = workspaceConfig.get(configurationSettings.advancedCreation);
        if (!parseError(error).isUserCancelledError && !advancedCreation) {

            const message: string = `Modify the setting "${extensionPrefix}.${configurationSettings.advancedCreation}" if you want to change the default values when creating a Web App in Azure.`;
            const btn: MessageItem = { title: 'Turn on advanced creation' };
            // tslint:disable-next-line: no-floating-promises
            ext.ui.showWarningMessage(message, btn).then(async result => {
                if (result === btn) {
                    await workspaceConfig.update('advancedCreation', true, ConfigurationTarget.Global);
                }
            });
        }
        throw error;
    }

    // prompt user to deploy to newly created web app
    window.showInformationMessage('Deploy to web app?', yesButton, noButton).then(
        async (input: MessageItem) => {
            if (input === yesButton) {
                await deploy(actionContext, false, createdApp);
            }
        });
}
