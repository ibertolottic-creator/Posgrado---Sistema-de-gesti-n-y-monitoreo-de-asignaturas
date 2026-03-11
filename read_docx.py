import sys
import zipfile
import xml.etree.ElementTree as ET

def read_docx(file_path):
    try:
        with zipfile.ZipFile(file_path) as docx:
            xml_content = docx.read('word/document.xml')
            tree = ET.fromstring(xml_content)
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            paragraphs = tree.findall('.//w:p', ns)
            text = []
            for p in paragraphs:
                texts = [node.text for node in p.iter() if getattr(node, 'tag', '').endswith('}t') and node.text]
                if texts:
                    text.append(''.join(texts))
            return '\n'.join(text)
    except Exception as e:
        return str(e)

if __name__ == "__main__":
    content = read_docx(sys.argv[1])
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        f.write(content)
