// MUI v9 for the prototype, part 3 (overlays, popups, autocomplete).
// Merged into window.MUI. Keep the list curated: every emitted chunk must
// stay under the 256 KiB DesignSync get_file cap. Add, rebuild, re-check.
// Deep imports (not the @mui/material barrel) so esbuild can split the
// two parts into separate chunks and share only what both need.
import Autocomplete from '@mui/material/Autocomplete';
import Snackbar from '@mui/material/Snackbar';
import SnackbarContent from '@mui/material/SnackbarContent';
import Backdrop from '@mui/material/Backdrop';
import Drawer from '@mui/material/Drawer';
import Menu from '@mui/material/Menu';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Popover from '@mui/material/Popover';

window.MUI = Object.assign(window.MUI || {}, {
  Autocomplete, Snackbar, SnackbarContent, Backdrop, Drawer, Menu, Dialog, DialogTitle,
  DialogContent, DialogContentText, DialogActions, Popover,
});
