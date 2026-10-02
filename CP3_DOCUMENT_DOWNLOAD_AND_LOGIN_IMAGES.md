# CP3 Document Download + Login Image Update

Updated from the CP2 blank-page-fix package.

## Included
- Replaced the three login feature images with the new black-background neon artwork:
  - Secure Login
  - NOI Lifecycle Management
  - Role Based Access
- Reordered the login feature cards to: Secure Login → NOI Lifecycle Management → Role Based Access.
- Kept the circular upper-left login-page picture upload control and improved it with a visible upload badge. The selected image is shown as a preview.
- Added `Defaced Challan` as a document type.
- Banker can use All Documents to download available SD, RF, SDR, NOI Receipt, NOI, Index 2 and Defaced Challan files.
- Vendor Employee now has All Documents in the sidebar.
- Vendor Employee can upload the later documents: Index 2, Defaced Challan and NOI Receipt.
- Vendor Employee can also download all available case documents.
- Added a Download all available action.
- Dashboard completion logic now follows: (SD + RF) OR (SDR + Defaced Challan), with Index 2 and NOI Receipt required.
- Vendor Employee All Documents also recognizes cases received through the Received Documents inbox.

## Build note
The isolated environment does not contain the project's npm dependencies, so a full `npm run build` was not executed here. The original package structure and dependencies were preserved.
