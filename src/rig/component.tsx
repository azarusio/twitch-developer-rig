import * as React from 'react';
import './component.sass';
import { RigNav } from '../rig-nav';
import { ExtensionViewContainer } from '../extension-view-container';
import { Console } from '../console';
import { ExtensionViewDialog } from '../extension-view-dialog';
import { RigConfigurationsDialog } from '../rig-configurations-dialog';
import { EditViewDialog, EditViewProps } from '../edit-view-dialog';
import { ProductManagementViewContainer } from '../product-management-container';
import { createExtensionObject } from '../util/extension';
import { createSignedToken } from '../util/token';
import { fetchManifest, fetchExtensionManifest, fetchUserInfo } from '../util/api';
import { ExtensionViews, BroadcasterConfig, LiveConfig, Configurations, ProductManagement } from '../constants/nav-items'
import { ViewerTypes } from '../constants/viewer-types';
import { OverlaySizes } from '../constants/overlay-sizes';
import { IdentityOptions } from '../constants/identity-options';
import { MobileSizes } from '../constants/mobile';
import { RigRole } from '../constants/rig';
import { RigExtensionView, RigExtension } from '../core/models/rig';
import { Extension } from '../core/models/extension';
import { ExtensionManifest } from '../core/models/manifest';
import { UserSession } from '../core/models/user-session';
import { SignInDialog } from '../sign-in-dialog';
import { ExtensionMode, ExtensionViewType } from '../constants/extension-coordinator';

export interface ReduxStateProps {
  session: UserSession;
}

export interface ReduxDispatchProps {
  saveManifest: (manifest: ExtensionManifest) => void;
  userLogin: (userSession: UserSession) => void;
}

export interface RigProps { }

interface State {
  apiHost: string;
  clientId: string;
  secret: string;
  version: string;
  channelId: string;
  userName: string;
  mode: string;
  extensionViews: RigExtensionView[],
  manifest: ExtensionManifest;
  showSignInDialog: boolean;
  showExtensionsView: boolean;
  showConfigurations: boolean;
  showEditView: boolean;
  showProductManagementView: boolean;
  idToEdit: string;
  selectedView: string;
  extension: RigExtension;
  userId: string;
  error: string;
}

type Props = RigProps & ReduxDispatchProps & ReduxStateProps;

export class RigComponent extends React.Component<Props, State> {
  public state: State = {
    apiHost: process.env.API_HOST || 'api.twitch.tv',
    clientId: process.env.EXT_CLIENT_ID,
    secret: process.env.EXT_SECRET,
    version: process.env.EXT_VERSION,
    channelId: process.env.EXT_CHANNEL_ID,
    userName: process.env.EXT_USER_NAME,
    mode: ExtensionMode.Viewer,
    extensionViews: [],
    manifest: {} as ExtensionManifest,
    showSignInDialog: true,
    showExtensionsView: false,
    showConfigurations: false,
    showEditView: false,
    showProductManagementView: false,
    idToEdit: '0',
    selectedView: ExtensionViews,
    extension: {} as RigExtension,
    userId: '',
    error: '',
  }

  constructor(props: Props) {
    super(props);
    this.setLogin();
  }

  public componentDidMount() {
    this.initLocalStorage();
    this.fetchInitialConfiguration();
  }

  public openConfigurationsHandler = () => {
    this.setState({
      showConfigurations: true,
    });
  }

  public closeConfigurationsHandler = () => {
    this.setState({
      showConfigurations: false,
    });
  }

  public openEditViewHandler = (id: string) => {
    this.setState({
      showEditView: true,
      idToEdit: id,
    });
  }

  public closeEditViewHandler = () => {
    this.setState({
      showEditView: false,
      idToEdit: '0',
    });
  }

  public viewerHandler = () => {
    this.setState({
      mode: ExtensionMode.Viewer,
      selectedView: ExtensionViews,
      extension: {} as RigExtension,
    });
  }

  public configHandler = () => {
    this.setState({
      mode: ExtensionMode.Config,
      selectedView: BroadcasterConfig,
      extension: createExtensionObject(
        this.state.manifest,
        '0',
        ViewerTypes.Broadcaster,
        true,
        this.state.userName,
        this.state.channelId,
        this.state.secret,
        ''),
    });
  }

  public liveConfigHandler = () => {
    this.setState({
      mode: ExtensionMode.Dashboard,
      selectedView: LiveConfig,

      extension: createExtensionObject(
        this.state.manifest,
        '0',
        ViewerTypes.Broadcaster,
        true,
        this.state.userName,
        this.state.channelId,
        this.state.secret,
        ''),
    });
  }

  private openProductManagementHandler = () => {
    this.setState({
      selectedView: ProductManagement,
    });
  }

  public openExtensionViewHandler = () => {
    if (this.state.error === '') {
      this.setState({
        showExtensionsView: true,
      });
    }
  }

  public closeExtensionViewDialog = () => {
    this.setState({
      showExtensionsView: false
    });
  }

  public closeSignInDialog = () => {
    this.setState({
      showSignInDialog: false
    });
  }

  private refreshConfigurationsHandler = () => {
    const token = createSignedToken(RigRole, '', this.state.userId, this.state.channelId, this.state.secret);
    fetchExtensionManifest(this.state.apiHost, this.state.clientId, this.state.version, token)
      .then(this.onConfigurationSuccess)
      .catch(this.onConfigurationError);
  }

  public onConfigurationSuccess = (data: any) => {
    this.props.saveManifest(data.manifest);
    this.setState(data);
  }

  public onConfigurationError = (errMsg: string) => {
    this.setState({
      error: errMsg,
    });
  }

  public getFrameSizeFromDialog(extensionViewDialogState: any) {
    if (extensionViewDialogState.frameSize === 'Custom') {
      return {
        width: extensionViewDialogState.width,
        height: extensionViewDialogState.height
      };
    }
    if (extensionViewDialogState.extensionViewType === ExtensionViewType.Mobile) {
      return MobileSizes[extensionViewDialogState.frameSize];
    }

    return OverlaySizes[extensionViewDialogState.frameSize];
  }

  public createExtensionView = (extensionViewDialogState: any) => {
    const extensionViews = this.getExtensionViews();
    const linked = extensionViewDialogState.identityOption === IdentityOptions.Linked;
    const nextExtensionViewId = extensionViews.reduce((a: number, b: RigExtensionView) => Math.max(a, parseInt(b.id, 10)), 0) + 1;
    extensionViews.push({
      id: nextExtensionViewId.toString(),
      type: extensionViewDialogState.extensionViewType,
      extension: createExtensionObject(
        this.state.manifest,
        nextExtensionViewId.toString(),
        extensionViewDialogState.viewerType,
        linked,
        this.state.userName,
        this.state.channelId,
        this.state.secret,
        extensionViewDialogState.opaqueId,
      ),
      linked: linked,
      role: extensionViewDialogState.viewerType,
      x: extensionViewDialogState.x,
      y: extensionViewDialogState.y,
      orientation: extensionViewDialogState.orientation,
      frameSize: this.getFrameSizeFromDialog(extensionViewDialogState),
    });
    this.pushExtensionViews(extensionViews);
    this.closeExtensionViewDialog();
  }

  public deleteExtensionView = (id: string) => {
    this.pushExtensionViews(this.state.extensionViews.filter(element => element.id !== id));
  }

  public editViewHandler = (newViewState: EditViewProps) => {
    const views = this.getExtensionViews();
    views.forEach((element: RigExtensionView) => {
      if (element.id === this.state.idToEdit) {
        element.x = newViewState.x;
        element.y = newViewState.y;
        element.orientation = newViewState.orientation;
      }
    });
    this.pushExtensionViews(views);
    this.closeEditViewHandler();
  }

  public render() {
    let view = (
      <div>
        <ExtensionViewContainer
          mode={this.state.mode}
          extensionViews={this.state.extensionViews}
          deleteExtensionViewHandler={this.deleteExtensionView}
          openExtensionViewHandler={this.openExtensionViewHandler}
          openEditViewHandler={this.openEditViewHandler}
          extension={this.state.extension} />
        {this.state.showExtensionsView &&
          <ExtensionViewDialog
            extensionViews={this.state.manifest.views}
            show={this.state.showExtensionsView}
            closeHandler={this.closeExtensionViewDialog}
            saveHandler={this.createExtensionView} />}
        {this.state.showEditView &&
          <EditViewDialog
            idToEdit={this.state.idToEdit}
            show={this.state.showEditView}
            views={this.getExtensionViews()}
            closeHandler={this.closeEditViewHandler}
            saveViewHandler={this.editViewHandler}
          />}
        {this.state.showConfigurations && <RigConfigurationsDialog
          config={this.state.manifest}
          closeConfigurationsHandler={this.closeConfigurationsHandler}
          refreshConfigurationsHandler={this.refreshConfigurationsHandler} />}
        {!this.props.session &&
          <SignInDialog
            show={this.state.showSignInDialog}
            closeSignInDialog={this.closeSignInDialog} />
        }
        <Console />
      </div>
    );

    if (this.state.selectedView === ProductManagement) {
      view = (
        <ProductManagementViewContainer clientId={this.state.clientId} />
      );
    }

    return (
      <div className="rig-container">
        <RigNav
          selectedView={this.state.selectedView}
          viewerHandler={this.viewerHandler}
          configHandler={this.configHandler}
          liveConfigHandler={this.liveConfigHandler}
          openConfigurationsHandler={this.openConfigurationsHandler}
          openProductManagementHandler={this.openProductManagementHandler}
          error={this.state.error} />
        {view}
      </div>
    );
  }

  public getExtensionViews() {
    const extensionViewsValue = localStorage.getItem("extensionViews");
    return extensionViewsValue ? JSON.parse(extensionViewsValue) : extensionViewsValue;
  }

  public pushExtensionViews(newViews: RigExtensionView[]) {
    localStorage.setItem("extensionViews", JSON.stringify(newViews));
    this.setState({
      extensionViews: newViews,
    });
  }

  private fetchInitialConfiguration() {
    if (this.state.userName) {
      fetchManifest(
        this.state.apiHost,
        this.state.clientId,
        this.state.userName,
        this.state.version,
        this.state.channelId,
        this.state.secret
      )
      .then(this.onConfigurationSuccess)
      .catch(this.onConfigurationError);
    }
  }

  private initLocalStorage() {
    const extensionViewsValue = localStorage.getItem("extensionViews");
    if (extensionViewsValue) {
      const extensionViews = JSON.parse(extensionViewsValue);
      extensionViews.forEach((view: RigExtensionView, index: number) => view.id = (index + 1).toString());
      this.setState({ extensionViews });
    } else {
      localStorage.setItem("extensionViews", JSON.stringify([]));
    }
  }

  private setLogin() {
    const windowHash = window.location.hash;
    const rigLogin = localStorage.getItem('rigLogin');
    if (windowHash.includes('access_token')) {
      const accessTokenKey = 'access_token=';
      const accessTokenIndex = windowHash.indexOf(accessTokenKey);
      const ampersandIndex = windowHash.indexOf('&');
      const accessToken = windowHash.substring(accessTokenIndex + accessTokenKey.length, ampersandIndex);
      fetchUserInfo(accessToken)
        .then(resp => {
          const userSess = {
            login: resp.login,
            authToken: accessToken,
            profileImageUrl: resp.profile_image_url,
          }
          this.state.userName = resp.login;
          this.props.userLogin(userSess);
          localStorage.setItem('rigLogin', JSON.stringify(userSess));
          window.location.assign('/');
        })
        .catch(err => {
          this.setState({
            error: err,
          });
        });
    }
    else if (rigLogin) {
      const login = JSON.parse(rigLogin);
      this.state.userName = login.login;
      this.props.userLogin({
        login: login.login,
        authToken: login.authToken,
        profileImageUrl: login.profileImageUrl,
      });
    }
  }
}
