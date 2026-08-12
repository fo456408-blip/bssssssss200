import pypdfium2 as pdfium
import os
import sys

def render_pdf_to_images(pdf_path, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    pdf = pdfium.PdfDocument(pdf_path)
    n_pages = len(pdf)
    print(f"Total pages in PDF ({pdf_path}): {n_pages}")
    
    image_paths = []
    for i in range(n_pages):
        page = pdf[i]
        image = page.render(scale=2).to_pil()
        out_name = f"report_page_{i+1}.png"
        out_path = os.path.join(output_dir, out_name)
        image.save(out_path)
        image_paths.append(out_path)
        print(f"Rendered Page {i+1} -> {out_path}")
    return image_paths

if __name__ == "__main__":
    pdf_file = sys.argv[1] if len(sys.argv) > 1 else "scratch/test_sample_report.pdf"
    out_dir = r"C:\Users\ah456\.gemini\antigravity\brain\de85fb69-d9d9-45b2-854b-08a259a059ba"
    render_pdf_to_images(pdf_file, out_dir)
