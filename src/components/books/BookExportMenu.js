import React, { useState } from 'react';
import { Button, Menu, MenuItem } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import UploadIcon from '@mui/icons-material/Upload';

const BookExportMenu = ({ books, genres, onImportClick, onSnackbar }) => {
  const [anchorEl, setAnchorEl] = useState(null);

  const handleExportJSON = () => {
    try {
      const dataStr = JSON.stringify(books, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

      const exportFileDefaultName = `books_export_${new Date().toISOString().split('T')[0]}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      onSnackbar({
        open: true,
        message: 'Books exported successfully',
        severity: 'success',
      });
    } catch (error) {
      onSnackbar({
        open: true,
        message: 'Export failed',
        severity: 'error',
      });
    }
  };

  const handleExportCSV = () => {
    try {
      const headers = ['Title', 'Author', 'Reading Level', 'Age Range'];
      const csvContent = [
        headers.join(','),
        ...books.map((book) =>
          [
            `"${(book.title || '').replace(/"/g, '""')}"`,
            `"${(book.author || '').replace(/"/g, '""')}"`,
            `"${(book.readingLevel || '').replace(/"/g, '""')}"`,
            `"${(book.ageRange || '').replace(/"/g, '""')}"`,
          ].join(',')
        ),
      ].join('\n');

      const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
      const exportFileDefaultName = `books_export_${new Date().toISOString().split('T')[0]}.csv`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      onSnackbar({
        open: true,
        message: 'Books exported successfully',
        severity: 'success',
      });
    } catch (error) {
      onSnackbar({
        open: true,
        message: 'Export failed',
        severity: 'error',
      });
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<ImportExportIcon />}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        size="small"
      >
        Import/Export
      </Button>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            onImportClick();
          }}
        >
          <UploadIcon fontSize="small" sx={{ mr: 1 }} />
          Import Books
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            handleExportJSON();
          }}
          disabled={books.length === 0}
        >
          <DownloadIcon fontSize="small" sx={{ mr: 1 }} />
          Export JSON
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            handleExportCSV();
          }}
          disabled={books.length === 0}
        >
          <DownloadIcon fontSize="small" sx={{ mr: 1 }} />
          Export CSV
        </MenuItem>
      </Menu>
    </>
  );
};

export default BookExportMenu;
