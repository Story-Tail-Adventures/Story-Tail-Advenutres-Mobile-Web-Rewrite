// MUI v9 for the prototype, part 2 (inputs, feedback, navigation).
// Merged into window.MUI. Keep the list curated: every emitted chunk must
// stay under the 256 KiB DesignSync get_file cap. Add, rebuild, re-check.
// Deep imports (not the @mui/material barrel) so esbuild can split the
// two parts into separate chunks and share only what both need.
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import IconButton from '@mui/material/IconButton';
import Fab from '@mui/material/Fab';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import InputBase from '@mui/material/InputBase';
import OutlinedInput from '@mui/material/OutlinedInput';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import FormHelperText from '@mui/material/FormHelperText';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Switch from '@mui/material/Switch';
import Slider from '@mui/material/Slider';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';
import Skeleton from '@mui/material/Skeleton';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import StepContent from '@mui/material/StepContent';
import Pagination from '@mui/material/Pagination';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';

window.MUI = Object.assign(window.MUI || {}, {
  Button, ButtonGroup, IconButton, Fab, ToggleButton, ToggleButtonGroup, TextField, InputAdornment,
  InputBase, OutlinedInput, FormControl, FormLabel, FormHelperText, FormControlLabel, FormGroup, InputLabel,
  Select, MenuItem, Checkbox, Radio, RadioGroup, Switch, Slider, Alert,
  AlertTitle, LinearProgress, CircularProgress, Skeleton, Tabs, Tab, Breadcrumbs, Stepper,
  Step, StepLabel, StepContent, Pagination, BottomNavigation, BottomNavigationAction,
});
