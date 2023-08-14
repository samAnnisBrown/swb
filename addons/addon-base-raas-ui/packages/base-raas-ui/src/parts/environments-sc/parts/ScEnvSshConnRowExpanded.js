import _ from 'lodash';
import React from 'react';
import { decorate, action, runInAction, observable, computed } from 'mobx';
import { observer, inject } from 'mobx-react';
import { withRouter } from 'react-router-dom';
import { Table, List, Segment, Label, Grid, Button } from 'semantic-ui-react';

import { displayError } from '@amzn/base-ui/dist/helpers/notification';

import CopyToClipboard from '../../helpers/CopyToClipboard';

const openWindow = (url, windowFeatures) => {
  return window.open(url, '_blank', windowFeatures);
};

// expected props
// networkInterfaces (via props)
// keyName (via props)
// connectionId (via props)
// environment (via props)
class ScEnvSshConnRowExpanded extends React.Component {
  constructor(props) {
    super(props);

    runInAction(() => {
      // The count down value
      this.countDown = undefined;
      this.intervalId = undefined;
      this.expired = false;
      this.processingId = undefined;
    });
  }

  get isAppStreamEnabled() {
    return process.env.REACT_APP_IS_APP_STREAM_ENABLED === 'true';
  }

  get networkInterfaces() {
    const entries = this.props.networkInterfaces;
    if (_.isEmpty(entries)) return [];

    const result = [];
    _.forEach(entries, item => {
      if (item.publicDnsName && !this.isAppStreamEnabled)
        result.push({ value: item.publicDnsName, type: 'dns', scope: 'public', info: 'Public' });
      if (item.privateIp) result.push({ value: item.privateIp, type: 'ip', scope: 'private', info: 'Private' });
    });

    return result;
  }

  get dcvInfo() {
    const entries = this.props.networkInterfaces;
    if (_.isEmpty(entries)) return [];

    const result = {};
    _.forEach(entries, item => {
      if (item.publicDnsName && !this.isAppStreamEnabled) {
        result["url"] = "https://" + item.publicDnsName + ":8443";
      }
    });

    return result;
  }

  get environment() {
    return this.props.scEnvironment;
  }

  get keyName() {
    return this.props.keyName;
  }

  get envsStore() {
    return this.props.scEnvironmentsStore;
  }

  get connectionId() {
    return this.props.connectionId;
  }

  getConnectionStore() {
    return this.envsStore.getScEnvConnectionStore(this.environment.id);
  }

  componentDidMount() {
    this.startCountDown();
  }

  componentWillUnmount() {
    this.clearInterval();
  }

  clearInterval() {
    if (!_.isUndefined(this.intervalId)) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.countDown = undefined;
    this.expired = false;
  }

  handleConnect = id =>
    action(async () => {
      try {
        runInAction(() => {
          this.processingId = id;
        });
        const store = this.getConnectionStore();
        const urlObj = await store.createConnectionUrl(id);
        const appStreamUrl = urlObj.url;
        if (appStreamUrl) {
          const newTab = openWindow('about:blank');
          newTab.location = appStreamUrl;
        } else {
          throw Error('AppStream URL was not returned by the API');
        }
        runInAction(() => {
          this.processingId = id;
        });
      } catch (error) {
        displayError(error);
      } finally {
        runInAction(() => {
          this.processingId = undefined;
        });
      }
    });

  startCountDown = () => {
    if (!_.isUndefined(this.intervalId)) return;
    this.countDown = 60;

    this.intervalId = setInterval(async () => {
      // eslint-disable-next-line consistent-return
      runInAction(() => {
        if (this.countDown <= 0) {
          this.clearInterval();
          this.expired = true;
          return;
        }
        this.countDown -= 1;
      });
    }, 1000);
  };

  render() {
    const connectionId = this.connectionId;
    const keyName = this.keyName;
    const interfaces = this.networkInterfaces;
    const example = `ssh -i '${keyName}.pem' ec2-user@${_.get(_.first(interfaces), 'value')}`;

    return (
      <Table.Row key={connectionId} className="fadeIn animated">
        <Table.Cell colSpan="3" className="p3">
          <Grid columns={2} stackable>
            <Grid.Row stretched>
              {this.isAppStreamEnabled ? (
                <Grid.Column width={12}>{this.renderAppStreamInfo()}</Grid.Column>
              ) : (
                <Grid.Column width={12}>{this.renderInfo()}</Grid.Column>
              )}
              <Grid.Column width={4}>
                <Segment className="flex items-center">
                  <div className="w-100">{this.renderCountDown()}</div>
                </Segment>
              </Grid.Column>
            </Grid.Row>
          </Grid>
          {!this.isAppStreamEnabled && (
            <div className="mt3">
              And here's an example SSH command to connect to your workspace:
              <Segment className="mt2">
                {example} <CopyToClipboard text={example} className="ml0 mt0" />
              </Segment>
            </div>
          )}
        </Table.Cell>
      </Table.Row>
    );
  }

  renderAppStreamInfo() {
    const interfaces = this.networkInterfaces;
    const network = interfaces[0];
    const connectionId = this.connectionId;

    return (
      <Segment>
        <List bulleted>
          <List.Item>
            The Private IP Address to be used:{' '}
            <List bulleted>
              <List.Item key={network.value} className="flex">
                {this.renderHostLabel(network)}
                <CopyToClipboard text={network.value} />
              </List.Item>
            </List>
          </List.Item>
        </List>
        {this.isAppStreamEnabled && (
          <Button
            size="mini"
            floated="left"
            primary
            onClick={this.handleConnect(connectionId)}
            disabled={this.processingId}
            loading={this.processingId}
            data-testid="connect-to-workspace-button"
          >
            Connect
          </Button>
        )}
      </Segment>
    );
  }

  renderInfo() {
    const interfaces = this.networkInterfaces;
    const dcvinfo = this.dcvInfo
    const keyName = this.keyName;
    const moreThanOne = _.size(interfaces) > 1;
    const sshCommand = `ssh -i '${keyName}.pem' ec2-user@${_.get(_.first(interfaces), 'value')}`;
    const getPasswordCommand = `ssh -i '${keyName}.pem' ec2-user@${_.get(_.first(interfaces), 'value')} /race/get_password.sh`;

    return (
      <div>
        <p>There are two ways to connect to your RACE Linux Workspace.</p>
        <h4>Desktop (GUI)</h4>
        <p>You can connect to a GUI in your web browser.</p>
        <List as='ol'>
          <List.Item as='li'>Make sure you have your <b>private key</b></List.Item>
          <List.Item as='li'>Copy and run this <b>ssh command</b>[1]<CopyToClipboard text={getPasswordCommand} className="ml0 mt0" /> to retrieve a <em>username</em> and <em>password</em>[2]</List.Item>
          <List.Item as='li'>Enter them at <a href={dcvinfo.url} target="_blank" >this link</a> to access your workspace (accept the certificate error. It's expected)</List.Item>
        </List>
        <h4>SSH (Terminal)</h4>
        <p>You can connect via SSH directly.</p>
        <List as='ol'>
          <List.Item as='li'>Make sure you have your <b>private key</b></List.Item>
          <List.Item as='li'>Copy and run this <b>ssh command</b>[1]<CopyToClipboard text={sshCommand} className="ml0 mt0" /></List.Item>
        </List>
        <b>Host details of your workspace are as follows should you need them:</b>
        <List>
          {_.map(interfaces, network => (
            <List.Item key={network.value} className="flex">
              {this.renderHostLabel(network)}
              <CopyToClipboard text={network.value} />
            </List.Item>
          ))}
        </List>
        <p>
          <em>[1] - You may need to modify the command to point to the location of your private key</em><br></br>
          <em>[2] - You can save this password for future use.  You can use it to connect to SSH also.</em>
        </p>
        <div className="mt3">
          If you need more help, these links go into more detail on how to SSH from your operating systems
        </div>
        <List bulleted>
          <List.Item
            href="https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/AccessingInstancesLinux.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Connecting from MacOS or Linux via SSH
          </List.Item>
          <List.Item
            href="https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/putty.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Connecting from Windows via Putty
          </List.Item>
        </List>
      </div>
    );
  }

  renderCountDown() {
    const expired = this.expired;
    const countDown = this.countDown;
    if (expired) {
      return (
        <div className="center color-red">
          The time window to connect has expired. To reset it, click on the <b className="fs-9">Use this SSH Key</b>{' '}
          button again.
        </div>
      );
    }

    return (
      <div className="center">
        <div className="mb1">
          You have <br /> <b>{countDown}</b> <br /> seconds to connect.  You can avoid this timeout once you generate a password.  See the Desktop (GUI) instructions.
        </div>
      </div>
    );
  }

  renderHostLabel(network) {
    return (
      <div>
        <Label>
          Host
          <Label.Detail>
            <span data-testid="host-ip">{network.value}</span> <span className="fs-7 pl1">({network.info})</span>
          </Label.Detail>
        </Label>
      </div>
    );
  }
}

// see https://medium.com/@mweststrate/mobx-4-better-simpler-faster-smaller-c1fbc08008da
decorate(ScEnvSshConnRowExpanded, {
  networkInterfaces: computed,
  keyName: computed,
  envsStore: computed,
  connectionId: computed,
  intervalId: observable,
  countDown: observable,
  expired: observable,
  processingId: observable,
  startCountDown: action,
  clearInterval: action,
});

export default inject()(withRouter(observer(ScEnvSshConnRowExpanded)));
