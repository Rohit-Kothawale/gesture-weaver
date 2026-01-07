import { useCallback } from 'react';
import { Upload, FileText } from 'lucide-react';

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  hasData: boolean;
  fileName?: string;
}

const FileUpload = ({ onFileUpload, hasData, fileName }: FileUploadProps) => {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.csv')) {
        onFileUpload(file);
      }
    },
    [onFileUpload]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileUpload(file);
      }
    },
    [onFileUpload]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="relative"
    >
      <input
        type="file"
        accept=".csv"
        onChange={handleChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />
      <div
        className={`
          flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed
          transition-all duration-300 cursor-pointer
          ${hasData 
            ? 'border-secondary/50 bg-secondary/10 hover:border-secondary' 
            : 'border-border hover:border-primary/50 bg-muted/30 hover:bg-muted/50'
          }
        `}
      >
        {hasData ? (
          <>
            <FileText className="w-5 h-5 text-secondary" />
            <span className="text-sm text-foreground font-medium truncate max-w-[150px]">
              {fileName}
            </span>
          </>
        ) : (
          <>
            <Upload className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Upload CSV
            </span>
          </>
        )}
      </div>
    </div>
  );
};

export default FileUpload;
