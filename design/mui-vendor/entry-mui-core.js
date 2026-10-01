// MUI v9 for the prototype, part 1 (theme, layout, surfaces, display).
// Merged into window.MUI. Keep the list curated: every emitted chunk must
// stay under the 256 KiB DesignSync get_file cap. Add, rebuild, re-check.
// Deep imports (not the @mui/material barrel) so esbuild can split the
// two parts into separate chunks and share only what both need.
import { createTheme, ThemeProvider, useTheme, useColorScheme, alpha, darken, lighten, styled } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import ScopedCssBaseline from '@mui/material/ScopedCssBaseline';
import GlobalStyles from '@mui/material/GlobalStyles';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import CardActions from '@mui/material/CardActions';
import CardActionArea from '@mui/material/CardActionArea';
import CardMedia from '@mui/material/CardMedia';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';
import Avatar from '@mui/material/Avatar';
import AvatarGroup from '@mui/material/AvatarGroup';
import Badge from '@mui/material/Badge';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListSubheader from '@mui/material/ListSubheader';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableFooter from '@mui/material/TableFooter';
import SvgIcon from '@mui/material/SvgIcon';

window.MUI = Object.assign(window.MUI || {}, {
  createTheme, ThemeProvider, CssBaseline, ScopedCssBaseline, useTheme, useColorScheme, alpha, darken,
  lighten, styled, GlobalStyles, Box, Stack, Grid, Container, Divider,
  Paper, Card, CardContent, CardHeader, CardActions, CardActionArea, CardMedia, AppBar,
  Toolbar, Accordion, AccordionSummary, AccordionDetails, Typography, Link, Avatar, AvatarGroup,
  Badge, Chip, Tooltip, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  ListItemAvatar, ListSubheader, Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  TableFooter, SvgIcon,
});
