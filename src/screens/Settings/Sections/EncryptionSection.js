import React, { Component } from 'react';
import StyleKit from "@Style/StyleKit"
import {Text, View} from 'react-native';
import KeysManager from "@Lib/keysManager"
import ModelManager from "@Lib/sfjs/modelManager"

import SectionHeader from "@Components/SectionHeader";
import ButtonCell from "@Components/ButtonCell";
import TableSection from "@Components/TableSection";
import SectionedTableCell from "@Components/SectionedTableCell";
import SectionedAccessoryTableCell from "@Components/SectionedAccessoryTableCell";

export default class PasscodeSection extends Component {

  constructor(props) {
    super(props);
  }

  render() {
    var source = KeysManager.get().encryptionSource();
    var enabled = source !== null;
    if(source == "offline") {
      enabled = KeysManager.get().isStorageEncryptionEnabled();
    }
    var storageEncryptionAvailable = source != null;
    var encryptionStatus = enabled ? "Enabled" : "Not Enabled";
    var sourceString = source == "account" ? "Account Keys" : "Passcode";
    var encryptionType = "AES-256";

    var items = ModelManager.get().allItemsMatchingTypes(["Note", "Tag"]);
    var itemsStatus = items.length + "/" + items.length + " notes and tags encrypted";

    var textStyles = {
      color: StyleKit.variable("stylekitForegroundColor"),
      fontSize: 16,
      lineHeight: 22
    }

    return (
      <TableSection>
        <SectionHeader title={this.props.title} />

        <SectionedTableCell last={!enabled} first={true}>
          <Text style={textStyles}>
            <Text style={{fontWeight: "bold"}}>Encryption: </Text>
            <Text>{encryptionStatus}</Text>
            {enabled &&
              <Text> | {encryptionType}</Text>
            }
          </Text>
          {!enabled &&
            <Text style={[textStyles, {marginTop: 4, color: StyleKit.variable("stylekitNeutralColor")}]}>
            {storageEncryptionAvailable
              ? "To enable encryption, sign in, register, or enable storage encryption."
              : "Sign in, register, or add a local passcode to enable encryption."
            }
            </Text>
          }
        </SectionedTableCell>

        {enabled &&
          <SectionedTableCell>
            <Text style={textStyles}>
              <Text style={{fontWeight: "bold"}}>Encryption Source: </Text>
              <Text>{sourceString}</Text>
            </Text>
          </SectionedTableCell>
        }

        {enabled &&
          <SectionedTableCell last={true}>
            <Text style={textStyles}>
              <Text style={{fontWeight: "bold"}}>Items Encrypted: </Text>
              <Text>{itemsStatus}</Text>
            </Text>
          </SectionedTableCell>
        }


      </TableSection>
    );
  }
}