import React, { useState } from 'react';
import { Button, Menu, MenuItem } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import UploadIcon from '@mui/icons-material/Upload';

// First four columns stay in the legacy order (Title, Author, Reading Level, Age
// Range) for the positional BookManager parser; header names are chosen so the
// import wizard's detectColumnMapping auto-maps every field on re-import.
export const buildBooksCsv = (books) => {
  const headers = [
    'Title',
    'Author',
    'Reading Level',
    'Age Range',
    'ISBN',
    'Description',
    'Pages',
    'Publication Year',
    'Series',
    'Series Number',
  ];
  // Both CSV parsers split on newlines before honouring quotes, so embedded
  // newlines (common in descriptions) must be flattened to spaces.
  const cell = (value) =>
    `"${String(value ?? '')
      .replace(/\r?\n/g, ' ')
      .replace(/"/g, '""')}"`;
  return [
    headers.join(','),
    ...books.map((book) =>
      [
        book.title,
        book.author,
        book.readingLevel,
        book.ageRange,
        book.isbn,
        book.description,
        book.pageCount,
        book.publicationYear,
        book.seriesName,
        book.seriesNumber,
      ]
        .map(cell)
        .join(',')
    ),
  ].join('\n');
};

const BookExportMenu = ({ books, _genres, onImportClick, onSnackbar }) => {
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
      const csvContent = buildBooksCsv(books);

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
